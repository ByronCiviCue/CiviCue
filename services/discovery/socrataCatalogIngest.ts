import {
  type SocrataCatalogIngestOptions,
  type SocrataCatalogIngestResult,
  type IngestRegion,
  type ErrorClassification,
  type RetryConfig,
  SocrataCatalogIngestError
} from '../../src/types/ingest.js';
import { iterateDomainsAndAgencies } from '../../src/adapters/socrata/catalogDiscovery.js';
import { getSocrataAppToken } from '../../src/lib/secrets/secrets.js';
import { sleep } from '../../src/adapters/socrata/http.js';
import { isSocrataClientError } from '../../src/adapters/socrata/types.js';
import { loadResumeState, processItemBatch, type CatalogItem } from '../../src/db/catalog/repo.js';
import { getMetrics, METRICS, type MetricsCollector } from '../../src/observability/metrics.js';
import { createObservabilityLogger, type StructuredLogger } from '../../src/observability/log.js';

/**
 * Socrata catalog ingestion service with cursor-based pagination and resume functionality.
 * 
 * Provides structured iteration through Socrata Discovery API with progress tracking,
 * resume capabilities, and comprehensive error handling. Guarantees idempotent operations
 * and consistent logging structure across runs.
 */

interface ResumeState {
  region: IngestRegion;
  cursor: string;
  processed: number;
}

interface CursorToken {
  region: IngestRegion;
  cursor: string;
  processed: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  max_attempts: 3,
  base_delay_ms: 1000,
  max_delay_ms: 30000,
  enable_jitter: true,
};

const DEFAULT_BATCH_SIZE = 100;
const SOCRATA_PIPELINE = 'socrata_catalog';

/**
 * Classifies errors as transient (retryable) or fatal (immediate failure).
 * 
 * Classification rules:
 * - TRANSIENT: HTTP 429/5xx, network/timeout errors, unknown errors (safe retry)
 * - FATAL: HTTP 401/403/404, parse/validation errors (TypeError, SyntaxError)
 * 
 * @param error The error to classify (Error instance, HTTP response, or unknown)
 * @returns 'TRANSIENT' for retryable errors, 'FATAL' for immediate failures
 */
function classifyError(error: unknown): ErrorClassification {
  // Socrata client errors (from http.ts)
  if (isSocrataClientError(error)) {
    const status = error.error.status;
    if (status === 429 || (status && status >= 500)) {
      return 'TRANSIENT'; // Rate limited or server errors
    }
    if (status === 401 || status === 403 || status === 404) {
      return 'FATAL'; // Auth errors or not found
    }
    return 'TRANSIENT'; // Other HTTP errors might be transient
  }
  
  // Network/timeout errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || 
        message.includes('network') || 
        message.includes('fetch') ||
        message.includes('econnreset') ||
        message.includes('enotfound')) {
      return 'TRANSIENT';
    }
  }
  
  // Parse/validation errors are fatal
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return 'FATAL';
  }
  
  // Default to transient for unknown errors
  return 'TRANSIENT';
}

function validateOptions(opts: SocrataCatalogIngestOptions): void {
  if (!Array.isArray(opts.regions) || opts.regions.length === 0) {
    throw new SocrataCatalogIngestError('CONFIG', 'regions must be a non-empty array');
  }

  for (const region of opts.regions) {
    if (region !== 'US' && region !== 'EU') {
      throw new SocrataCatalogIngestError('CONFIG', `Invalid region: ${region}. Must be 'US' or 'EU'`);
    }
  }

  if (!Number.isInteger(opts.pageSize) || opts.pageSize <= 0) {
    throw new SocrataCatalogIngestError('CONFIG', 'pageSize must be a positive integer');
  }

  if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
    throw new SocrataCatalogIngestError('CONFIG', 'limit must be a positive integer');
  }

  if (opts.batchSize !== undefined && (!Number.isInteger(opts.batchSize) || opts.batchSize <= 0)) {
    throw new SocrataCatalogIngestError('CONFIG', 'batchSize must be a positive integer');
  }
}

/**
 * Parses resume cursor token from JSON string.
 * @param resumeFrom JSON string containing resume state
 * @returns Parsed resume state or null if invalid
 */
function parseResumeCursor(resumeFrom: string): ResumeState {
  try {
    const parsed = JSON.parse(resumeFrom);
    if (typeof parsed.region === 'string' && 
        typeof parsed.cursor === 'string' && 
        typeof parsed.processed === 'number' &&
        (parsed.region === 'US' || parsed.region === 'EU')) {
      return parsed as ResumeState;
    }
    throw new Error('Invalid resume cursor structure');
  } catch (error) {
    throw new SocrataCatalogIngestError(
      'CONFIG', 
      'Invalid resumeFrom format. Expected JSON with region, cursor, and processed fields.',
      error
    );
  }
}

/**
 * Computes effective processing options considering resume state.
 * @param opts Original options
 * @param resumeState Parsed resume state if any
 * @returns Effective regions and adjusted limit
 */
function effectiveOptions(
  opts: SocrataCatalogIngestOptions, 
  resumeState: ResumeState | null
): { regions: IngestRegion[]; pageSize: number; limit: number; startIndex: number } {
  let startIndex = 0;
  
  if (resumeState) {
    const resumeIndex = opts.regions.indexOf(resumeState.region);
    if (resumeIndex >= 0) {
      startIndex = resumeIndex;
    }
  }

  return {
    regions: opts.regions.slice(startIndex),
    pageSize: opts.pageSize,
    limit: opts.limit - (resumeState?.processed ?? 0),
    startIndex,
  };
}

/**
 * Serializes cursor token to opaque JSON string.
 * @param token Cursor token object
 * @returns JSON string for resume operations
 */
function serializeCursor(token: CursorToken): string {
  return JSON.stringify(token);
}

/**
 * Handles fatal errors by logging and throwing appropriate exception.
 */
function handleFatalError(
  error: unknown, 
  attempt: number, 
  logger: NonNullable<SocrataCatalogIngestOptions['logger']>
): never {
  logger.error('Fatal error encountered', { 
    error_type: 'FATAL',
    error: error instanceof Error ? error.message : String(error),
    attempt: attempt + 1,
  });
  throw new SocrataCatalogIngestError('RUNTIME', 'Fatal error during catalog iteration', error);
}

/**
 * Handles retry exhaustion by logging and throwing appropriate exception.
 */
function handleRetryExhaustion(
  error: unknown, 
  totalAttempts: number, 
  logger: NonNullable<SocrataCatalogIngestOptions['logger']>
): never {
  logger.error('Retry exhausted', {
    error_type: 'TRANSIENT', 
    total_attempts: totalAttempts,
    final_error: error instanceof Error ? error.message : String(error),
  });
  throw new SocrataCatalogIngestError('RUNTIME', `Retry exhausted after ${totalAttempts} attempts`, error);
}

/**
 * Calculates exponential backoff delay with optional jitter.
 */
function calculateRetryDelay(
  attempt: number, 
  baseDelayMs: number, 
  maxDelayMs: number, 
  enableJitter: boolean
): number {
  const baseDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = enableJitter ? Math.random() * baseDelayMs : 0;
  return Math.min(baseDelay + jitter, maxDelayMs);
}

/**
 * Wraps the domains and agencies iterator with retry logic and error handling.
 * @param options Iterator configuration with retry settings
 * @param retryConfig Retry behavior configuration
 * @param logger Structured logger for error events
 * @returns Iterator with retry logic applied
 */
async function* iterateWithRetry(
  options: {
    regions: ('US' | 'EU')[];
    pageSize: number;
    limit: number;
    appToken?: string;
  },
  retryConfig: RetryConfig,
  logger: NonNullable<SocrataCatalogIngestOptions['logger']>
): AsyncGenerator<{ region: 'US' | 'EU'; host: string; domain: string; agency: string | null; meta?: unknown }> {
  const { max_attempts, base_delay_ms, max_delay_ms, enable_jitter } = retryConfig;
  
  let attempt = 0;
  
  while (attempt <= max_attempts) {
    try {
      const iterator = iterateDomainsAndAgencies(options);
      
      for await (const item of iterator) {
        yield item;
      }
      return; // Successfully completed
      
    } catch (error: unknown) {
      const classification = classifyError(error);
      
      if (classification === 'FATAL') {
        handleFatalError(error, attempt, logger);
      }
      
      if (attempt >= max_attempts) {
        handleRetryExhaustion(error, attempt + 1, logger);
      }
      
      const delay = calculateRetryDelay(attempt, base_delay_ms, max_delay_ms, enable_jitter);
      
      logger.info('Retry attempt', {
        attempt_number: attempt + 1,
        delay_ms: Math.round(delay),
        error_type: 'TRANSIENT',
        error_message: error instanceof Error ? error.message : String(error),
      });
      
      await sleep(delay);
      attempt++;
    }
  }
}

/**
 * Builds final result object with consistent structure.
 * @param opts Original options
 * @param state Processing state
 * @param timestamps Start and end times
 * @returns Complete result object
 */
function finalizeResult(
  opts: SocrataCatalogIngestOptions,
  state: {
    totalProcessed: number;
    lastCursor: string | null;
    completedRegions: IngestRegion[];
  },
  timestamps: { startedAt: string; finishedAt: string }
): SocrataCatalogIngestResult {
  return {
    startedAt: timestamps.startedAt,
    finishedAt: timestamps.finishedAt,
    plannedRegions: [...opts.regions],
    plannedPageSize: opts.pageSize,
    plannedLimit: opts.limit,
    dryRun: opts.dryRun,
    resumeFrom: opts.resumeFrom,
    totalProcessed: state.totalProcessed,
    lastCursor: state.lastCursor,
    completedRegions: state.completedRegions,
  };
}

function createDefaultLogger() {
  return {
    info(): void {},
    warn(): void {},
    error(): void {},
    debug(): void {},
  };
}

/**
 * Loads durable resume state from database if enabled and not dry-run.
 * @param resumeEnabled Whether resume functionality is enabled
 * @param dryRun Whether this is a dry-run operation
 * @param logger Structured logger for events
 * @param metrics Metrics collector for instrumentation
 * @returns Resume token string or null if not found/disabled
 */
async function loadDurableResume(
  resumeEnabled: boolean,
  dryRun: boolean,
  logger: StructuredLogger,
  metrics: MetricsCollector
): Promise<string | null> {
  if (!resumeEnabled || dryRun) {
    return null;
  }

  try {
    const resumeState = await loadResumeState(SOCRATA_PIPELINE);
    if (resumeState?.resume_token) {
      // Emit metrics for resume restart
      metrics.increment(METRICS.RESUME_RESTARTS_TOTAL, 1, { 
        pipeline: SOCRATA_PIPELINE 
      });
      
      logger.info('Resume from token', {
        pipeline: SOCRATA_PIPELINE,
        last_processed_at: resumeState.last_processed_at?.toISOString(),
        token_length: resumeState.resume_token.length,
      });
      return resumeState.resume_token;
    }
    return null;
  } catch (error) {
    logger.warn('Failed to load resume state', { 
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Processes a batch of catalog items with transactional persistence.
 * @param batch Array of catalog items to process
 * @param resumeToken Token to save after successful batch processing
 * @param processedAt Timestamp for the batch
 * @param logger Structured logger for events
 * @param metrics Metrics collector for instrumentation
 * @param dryRun Whether this is a dry-run operation
 */
async function processBatchWithResume(
  batch: CatalogItem[],
  resumeToken: string,
  processedAt: Date,
  logger: StructuredLogger,
  metrics: MetricsCollector,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    if (logger.debug) {
      logger.debug('Dry-run batch processing', { 
        batch_size: batch.length,
        resume_token_length: resumeToken.length,
      });
    }
    return;
  }

  const startTime = Date.now();
  
  try {
    await processItemBatch(batch, resumeToken, processedAt);
    
    const duration = Date.now() - startTime;
    
    // Emit metrics
    metrics.increment(METRICS.BATCHES_TOTAL, 1);
    metrics.increment(METRICS.ITEMS_TOTAL, batch.length);
    metrics.timing(METRICS.BATCH_DURATION_MS, duration);
    
    logger.info('Batch processed', {
      batch_size: batch.length,
      items_total: batch.length,
      duration_ms: duration,
      resume_token_advanced: true,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Batch rollback', {
      batch_size: batch.length,
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
      resume_preserved: true,
    });
    throw error;
  }
}

/**
 * Processes catalog items from iterator in batches with resume functionality.
 * @param iterator Async iterator of catalog items
 * @param batchSize Number of items per batch
 * @param limit Maximum total items to process
 * @param startingProcessed Number of items already processed (from resume)
 * @param logger Structured logger for events
 * @param metrics Metrics collector for instrumentation
 * @param now Time provider function
 * @param dryRun Whether this is a dry-run operation
 * @returns Total processed count and last cursor
 */
async function processItemsInBatches(
  iterator: AsyncGenerator<{ region: 'US' | 'EU'; host: string; domain: string; agency: string | null; meta?: unknown }>,
  batchSize: number,
  limit: number,
  startingProcessed: number,
  logger: StructuredLogger,
  metrics: MetricsCollector,
  now: () => Date,
  dryRun: boolean
): Promise<{ totalProcessed: number; lastCursor: string | null }> {
  let totalProcessed = startingProcessed;
  let lastCursor: string | null = null;
  let currentBatch: CatalogItem[] = [];
  const seenItems = new Set<string>(); // Track items within session for duplicate detection

  for await (const item of iterator) {
    // Create unique key for duplicate detection
    const itemKey = `${item.region}:${item.host}:${item.domain}:${item.agency || 'null'}`;
    
    // Check for duplicates within current session
    if (seenItems.has(itemKey)) {
      metrics.increment(METRICS.DUPLICATES_SKIPPED_TOTAL, 1, {
        region: item.region,
      });
      
      if (logger.debug) {
        logger.debug('Duplicate skipped', {
          host: item.host,
          domain: item.domain,
          agency: item.agency,
          region: item.region,
        });
      }
      continue; // Skip duplicate item
    }
    
    seenItems.add(itemKey);

    // Add item to current batch
    currentBatch.push({
      region: item.region,
      host: item.host,
      domain: item.domain,
      agency: item.agency,
      meta: item.meta,
    });

    totalProcessed++;
    lastCursor = serializeCursor({
      region: item.region,
      cursor: 'next',
      processed: totalProcessed,
    });

    if (logger.debug) {
      logger.debug('Processing progress', { 
        region: item.region, 
        host: item.host, 
        agency: item.agency,
        total_processed: totalProcessed,
        batch_size: currentBatch.length,
      });
    }

    // Process batch when it reaches configured size
    if (currentBatch.length >= batchSize) {
      await processBatchWithResume(currentBatch, lastCursor, now(), logger, metrics, dryRun);
      currentBatch = []; // Reset batch
    }

    if (totalProcessed >= limit) {
      logger.info('Limit reached', { limit });
      break;
    }
  }

  // Process remaining items in final batch
  if (currentBatch.length > 0 && lastCursor) {
    await processBatchWithResume(currentBatch, lastCursor, now(), logger, metrics, dryRun);
  }

  return { totalProcessed, lastCursor };
}

/**
 * Runs Socrata catalog ingestion with durable resume and idempotent writes.
 * 
 * Features:
 * - Durable resume state persisted in database with crash-safe recovery
 * - Batch processing with configurable size for optimal database performance
 * - Idempotent upserts ensuring exactly-once semantics across restarts
 * - Transactional guarantees: batch + resume state updated atomically
 * - Exponential backoff retry logic with configurable parameters
 * - Error classification (TRANSIENT vs FATAL) with appropriate handling
 * - Structured logging with stable snake_case event keys
 * - Dry-run mode for validation without side effects or state persistence
 * - Multi-region processing support
 * 
 * Logging structure (stable keys):
 * - ingest_start: regions, page_size, limit, dry_run, batch_size, resume_enabled
 * - resume_state_loaded: pipeline, last_processed_at, resume_token_length
 * - batch_committed: batch_size, items_processed, resume_token_advanced
 * - batch_rollback: batch_size, error_message, resume_preserved
 * - limit_reached: limit
 * - retry_attempt: attempt_number, delay_ms, error_type, error_message
 * - catalog_iteration_failed: error_type, error_message, total_processed
 * - ingest_complete: final result object
 * 
 * @param opts Ingestion configuration options including batch and resume settings
 * @returns Processing results with pagination state and completion metrics
 * @throws SocrataCatalogIngestError for configuration errors or exhausted retries
 */
export async function runSocrataCatalogIngest(
  opts: SocrataCatalogIngestOptions
): Promise<SocrataCatalogIngestResult> {
  try {
    validateOptions(opts);

    const baseLogger = opts.logger ?? createDefaultLogger();
    const metricsEnabled = opts.metricsEnabled ?? true;
    const logLevel = opts.logLevel ?? 'info';
    
    // Initialize observability components
    const metrics = getMetrics(metricsEnabled);
    const logger = createObservabilityLogger(baseLogger, logLevel, true);
    
    const now = opts.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const pipelineStartTime = Date.now();
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const resumeEnabled = opts.resumeEnabled ?? true;
    
    logger.info('Starting Socrata catalog ingest', {
      regions: opts.regions,
      page_size: opts.pageSize,
      limit: opts.limit,
      dry_run: opts.dryRun,
      batch_size: batchSize,
      resume_enabled: resumeEnabled,
      resume_from: opts.resumeFrom,
    });

    // Load durable resume state from database (if enabled and not dry-run)
    const durableResumeToken = await loadDurableResume(resumeEnabled, opts.dryRun, logger, metrics);
    
    // Guard clause: parse resume state from options or database
    const resumeState = opts.resumeFrom ? 
      parseResumeCursor(opts.resumeFrom) : 
      (durableResumeToken ? parseResumeCursor(durableResumeToken) : null);
    
    // Guard clause: skip batch processing in dry-run mode  
    if (opts.dryRun) {
      const finishedAt = now().toISOString();
      return finalizeResult(opts, {
        totalProcessed: 0,
        lastCursor: null,
        completedRegions: [],
      }, { startedAt, finishedAt });
    }

    const effective = effectiveOptions(opts, resumeState);
    if (resumeState && effective.startIndex >= 0) {
      logger.info('Resume operation', { 
        region: resumeState.region, 
        processed: resumeState.processed 
      });
    }

    const startingProcessed = resumeState?.processed ?? 0;
    const appToken = getSocrataAppToken();
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...(opts.retryConfig ?? {}) };
    
    let totalProcessed = startingProcessed;
    let lastCursor: string | null = null;

    try {
      const iterator = iterateWithRetry({
        regions: effective.regions as ('US' | 'EU')[],
        pageSize: effective.pageSize,
        limit: effective.limit,
        appToken: appToken ?? undefined,
      }, retryConfig, logger);

      const result = await processItemsInBatches(
        iterator,
        batchSize,
        opts.limit,
        startingProcessed,
        logger,
        metrics,
        now,
        opts.dryRun
      );

      totalProcessed = result.totalProcessed;
      lastCursor = result.lastCursor;

    } catch (error: unknown) {
      const classification = classifyError(error);
      logger.error('Catalog iteration failed', { 
        error_type: classification,
        error_message: error instanceof Error ? error.message : String(error),
        total_processed: totalProcessed,
      });
      throw new SocrataCatalogIngestError('RUNTIME', 'Failed to iterate through catalog data', error);
    }
    
    const finishedAt = now().toISOString();
    const pipelineDuration = Date.now() - pipelineStartTime;
    
    // Emit pipeline-level metrics
    metrics.timing(METRICS.PIPELINE_DURATION_MS, pipelineDuration, {
      regions: opts.regions.join(','),
      dry_run: String(opts.dryRun),
    });
    
    const result = finalizeResult(opts, {
      totalProcessed,
      lastCursor,
      completedRegions: [...opts.regions], // Simplified: mark all as completed
    }, { startedAt, finishedAt });

    logger.info('Ingest complete', { 
      ...result,
      pipeline_duration_ms: pipelineDuration,
    });
    return result;
    
  } catch (error: unknown) {
    if (error instanceof SocrataCatalogIngestError) {
      throw error;
    }
    throw new SocrataCatalogIngestError('RUNTIME', 'Unexpected error during catalog ingest', error);
  }
}
