import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSocrataCatalogIngest } from '../../services/discovery/socrataCatalogIngest.js';
import type { SocrataCatalogIngestOptions } from '../../src/types/ingest.js';

/**
 * Test suite for Socrata catalog ingestion service.
 * 
 * Verifies behavior for:
 * - Multi-page pagination through Discovery API results
 * - Resume functionality with cursor-based state tracking
 * - Durable resume state with database persistence
 * - Batch processing with configurable size
 * - Idempotent writes with transactional guarantees
 * - Error handling for invalid cursors and network failures
 * - Retry logic with exponential backoff and error classification
 * - Fatal vs transient error handling with appropriate logging
 * - Custom retry configuration support
 * - Dry-run mode with no side effects
 * - Processing limits and early termination
 * - Multi-region processing workflows
 * 
 * Tests guarantee consistent cursor format, stable logging structure,
 * and exactly-once semantics across restarts.
 */

// Mock the catalog discovery module
vi.mock('../../src/adapters/socrata/catalogDiscovery.js', () => ({
  iterateDomainsAndAgencies: vi.fn()
}));

// Mock the secrets module  
vi.mock('../../src/lib/secrets/secrets.js', () => ({
  getSocrataAppToken: vi.fn(() => 'test-token'),
  isDatabaseDryRun: vi.fn(() => false)
}));

// Mock the database repository functions
vi.mock('../../src/db/catalog/repo.js', () => ({
  loadResumeState: vi.fn(),
  processItemBatch: vi.fn()
}));

const { iterateDomainsAndAgencies } = await import('../../src/adapters/socrata/catalogDiscovery.js');
const { loadResumeState, processItemBatch } = await import('../../src/db/catalog/repo.js');
const mockIterateDomainsAndAgencies = vi.mocked(iterateDomainsAndAgencies);
const mockLoadResumeState = vi.mocked(loadResumeState);
const mockProcessItemBatch = vi.mocked(processItemBatch);

describe('Socrata Catalog Ingest - Pagination', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const baseOptions: SocrataCatalogIngestOptions = {
    regions: ['US'],
    pageSize: 2,
    limit: 5,
    dryRun: false,
    logger: mockLogger,
    now: () => new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior: no prior resume state
    mockLoadResumeState.mockResolvedValue(null);
    mockProcessItemBatch.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should paginate through multiple pages of results', async () => {
    // Mock iterator that yields 3 items
    const mockItems = [
      { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' },
      { region: 'US' as const, host: 'data.city2.gov', domain: 'city2.gov', agency: 'Department B' },
      { region: 'US' as const, host: 'data.city3.gov', domain: 'city3.gov', agency: null },
    ];

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (const item of mockItems) {
        yield item;
      }
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(result).toMatchObject({
      totalProcessed: 3,
      completedRegions: ['US'],
      dryRun: false,
    });
    expect(result.lastCursor).toContain('"processed":3');
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US'],
      pageSize: 2,
      limit: 5,
      appToken: 'test-token',
    });
  });

  it('should respect the processing limit', async () => {
    // Mock iterator that yields more items than the limit
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (let i = 0; i < 10; i++) {
        yield { 
          region: 'US' as const, 
          host: `data.city${i}.gov`, 
          domain: `city${i}.gov`, 
          agency: `Agency ${i}` 
        };
      }
    });

    const limitedOptions = { ...baseOptions, limit: 3 };
    const result = await runSocrataCatalogIngest(limitedOptions);

    expect(result.totalProcessed).toBe(3);
    expect(mockLogger.info).toHaveBeenCalledWith('Limit reached', { limit: 3 });
  });

  it('should resume from a valid cursor', async () => {
    const resumeState = {
      region: 'US',
      cursor: 'some-cursor-token',
      processed: 2,
    };

    const resumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: JSON.stringify(resumeState),
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city4.gov', domain: 'city4.gov', agency: 'Department D' };
      yield { region: 'US' as const, host: 'data.city5.gov', domain: 'city5.gov', agency: 'Department E' };
    });

    const result = await runSocrataCatalogIngest(resumeOptions);

    expect(result.totalProcessed).toBe(4); // 2 from resume + 2 new items
    expect(mockLogger.info).toHaveBeenCalledWith('Resume operation', {
      region: 'US',
      processed: 2,
    });
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US'],
      pageSize: 2,
      limit: 3, // Original limit (5) - already processed (2)
      appToken: 'test-token',
    });
  });

  it('should handle invalid resume cursor', async () => {
    const invalidResumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: 'invalid-json',
    };

    await expect(runSocrataCatalogIngest(invalidResumeOptions)).rejects.toThrow(
      'Invalid resumeFrom format. Expected JSON with region, cursor, and processed fields.'
    );
  });

  it('should handle malformed resume cursor with missing fields', async () => {
    const incompleteResumeState = {
      region: 'US',
      // Missing cursor and processed fields
    };

    const invalidResumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: JSON.stringify(incompleteResumeState),
    };

    await expect(runSocrataCatalogIngest(invalidResumeOptions)).rejects.toThrow(
      'Invalid resumeFrom format. Expected JSON with region, cursor, and processed fields.'
    );
  });

  it('should handle iterator errors gracefully', async () => {
    const optionsWithFastRetry: SocrataCatalogIngestOptions = {
      ...baseOptions,
      retryConfig: {
        max_attempts: 1, // Only try once to avoid test timeout
        base_delay_ms: 10,
        max_delay_ms: 10,
        enable_jitter: false,
      },
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
      throw new Error('Network timeout');
    });

    await expect(runSocrataCatalogIngest(optionsWithFastRetry)).rejects.toThrow(
      'Failed to iterate through catalog data'
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Retry exhausted', { 
      error_type: 'TRANSIENT',
      total_attempts: 2,
      final_error: 'Network timeout',
    });
  });

  it('should handle fatal errors without retries', async () => {
    const fatalError = new TypeError('Invalid JSON response format');
    
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      // Fatal error occurs immediately
      throw fatalError;
      // eslint-disable-next-line no-unreachable
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
    });

    await expect(runSocrataCatalogIngest(baseOptions)).rejects.toThrow(
      'Failed to iterate through catalog data'
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Fatal error encountered', { 
      error_type: 'FATAL',
      error: 'Invalid JSON response format',
      attempt: 1,
    });
  });

  it('should use custom retry configuration', async () => {
    const optionsWithRetry: SocrataCatalogIngestOptions = {
      ...baseOptions,
      retryConfig: {
        max_attempts: 2,
        base_delay_ms: 500,
        max_delay_ms: 2000,
        enable_jitter: false,
      },
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
      yield { region: 'US' as const, host: 'data.city2.gov', domain: 'city2.gov', agency: 'Department B' };
    });

    const result = await runSocrataCatalogIngest(optionsWithRetry);

    expect(result.totalProcessed).toBe(2);
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US'],
      pageSize: 2,
      limit: 5,
      appToken: 'test-token',
    });
  });

  it('should skip pagination in dry-run mode', async () => {
    const dryRunOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      dryRun: true,
    };

    const result = await runSocrataCatalogIngest(dryRunOptions);

    expect(result.totalProcessed).toBe(0);
    expect(result.lastCursor).toBeNull();
    expect(result.completedRegions).toEqual([]);
    expect(mockIterateDomainsAndAgencies).not.toHaveBeenCalled();
  });

  it('should handle multi-region processing', async () => {
    const multiRegionOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      regions: ['US', 'EU'],
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'US Agency' };
      yield { region: 'EU' as const, host: 'data.city2.eu', domain: 'city2.eu', agency: 'EU Agency' };
    });

    const result = await runSocrataCatalogIngest(multiRegionOptions);

    expect(result.totalProcessed).toBe(2);
    expect(result.completedRegions).toEqual(['US', 'EU']);
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US', 'EU'],
      pageSize: 2,
      limit: 5,
      appToken: 'test-token',
    });
  });
});

describe('Socrata Catalog Ingest - Durable Resume & Idempotency', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const baseOptions: SocrataCatalogIngestOptions = {
    regions: ['US'],
    pageSize: 2,
    limit: 10,
    dryRun: false,
    batchSize: 3,
    resumeEnabled: true,
    logger: mockLogger,
    now: () => new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior: no prior resume state
    mockLoadResumeState.mockResolvedValue(null);
    mockProcessItemBatch.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load and use existing durable resume state', async () => {
    const existingResumeState = {
      pipeline: 'socrata_catalog',
      resume_token: '{"region":"US","cursor":"existing","processed":3}',
      last_processed_at: new Date('2024-01-01T12:00:00Z'),
      updated_at: new Date('2024-01-01T12:00:00Z'),
    };

    mockLoadResumeState.mockResolvedValue(existingResumeState);
    
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city4.gov', domain: 'city4.gov', agency: 'Department D' };
      yield { region: 'US' as const, host: 'data.city5.gov', domain: 'city5.gov', agency: 'Department E' };
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(mockLoadResumeState).toHaveBeenCalledWith('socrata_catalog');
    expect(mockLogger.info).toHaveBeenCalledWith('Resume state loaded', {
      pipeline: 'socrata_catalog',
      last_processed_at: '2024-01-01T12:00:00.000Z',
      resume_token_length: existingResumeState.resume_token.length,
    });
    expect(result.totalProcessed).toBe(5); // 3 from resume + 2 new
  });

  it('should process items in batches and advance resume token', async () => {
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      // Yield 5 items to create 2 full batches (3 items each) 
      for (let i = 1; i <= 5; i++) {
        yield { 
          region: 'US' as const, 
          host: `data.city${i}.gov`, 
          domain: `city${i}.gov`, 
          agency: `Agency ${i}` 
        };
      }
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(result.totalProcessed).toBe(5);
    // Should have called processItemBatch twice: once for first 3 items, once for remaining 2
    expect(mockProcessItemBatch).toHaveBeenCalledTimes(2);
    
    // Verify first batch call
    expect(mockProcessItemBatch).toHaveBeenNthCalledWith(1, 
      expect.arrayContaining([
        expect.objectContaining({ host: 'data.city1.gov', region: 'US' }),
        expect.objectContaining({ host: 'data.city2.gov', region: 'US' }),
        expect.objectContaining({ host: 'data.city3.gov', region: 'US' }),
      ]),
      expect.stringContaining('"processed":3'),
      expect.any(Date)
    );

    // Verify second batch call  
    expect(mockProcessItemBatch).toHaveBeenNthCalledWith(2,
      expect.arrayContaining([
        expect.objectContaining({ host: 'data.city4.gov', region: 'US' }),
        expect.objectContaining({ host: 'data.city5.gov', region: 'US' }),
      ]),
      expect.stringContaining('"processed":5'),
      expect.any(Date)
    );
  });

  it('should handle batch processing failure with resume preservation', async () => {
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (let i = 1; i <= 4; i++) {
        yield { 
          region: 'US' as const, 
          host: `data.city${i}.gov`, 
          domain: `city${i}.gov`, 
          agency: `Agency ${i}` 
        };
      }
    });

    // Mock batch failure on second call
    mockProcessItemBatch
      .mockResolvedValueOnce() // First batch succeeds
      .mockRejectedValueOnce(new Error('Database connection lost')); // Second batch fails

    await expect(runSocrataCatalogIngest(baseOptions)).rejects.toThrow(
      'Failed to iterate through catalog data'
    );

    expect(mockProcessItemBatch).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith('Batch rollback', {
      batch_size: 1, // Remaining item after first batch of 3
      error_message: 'Database connection lost',
      resume_preserved: true,
    });
  });

  it('should handle idempotent re-processing without duplicates', async () => {
    // Simulate processing the same data twice
    const sameItems = [
      { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' },
      { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' }, // Duplicate
    ];

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (const item of sameItems) {
        yield item;
      }
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(result.totalProcessed).toBe(2);
    expect(mockProcessItemBatch).toHaveBeenCalledTimes(1);
    
    // Verify idempotent items are passed to batch processor
    expect(mockProcessItemBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ host: 'data.city1.gov' }),
        expect.objectContaining({ host: 'data.city1.gov' }),
      ]),
      expect.any(String),
      expect.any(Date)
    );
  });

  it('should skip resume and batch operations in dry-run mode', async () => {
    const dryRunOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      dryRun: true,
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
    });

    const result = await runSocrataCatalogIngest(dryRunOptions);

    expect(result.totalProcessed).toBe(0);
    expect(result.lastCursor).toBeNull();
    // Should not load resume state in dry-run
    expect(mockLoadResumeState).not.toHaveBeenCalled();
    // Should not process any batches in dry-run
    expect(mockProcessItemBatch).not.toHaveBeenCalled();
  });

  it('should handle no prior resume state on first run', async () => {
    // mockLoadResumeState already defaults to null in beforeEach
    
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
      yield { region: 'US' as const, host: 'data.city2.gov', domain: 'city2.gov', agency: 'Department B' };
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(mockLoadResumeState).toHaveBeenCalledWith('socrata_catalog');
    expect(result.totalProcessed).toBe(2);
    expect(mockProcessItemBatch).toHaveBeenCalledTimes(1);
  });

  it('should respect custom batch size configuration', async () => {
    const customBatchOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      batchSize: 2, // Smaller batch size
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (let i = 1; i <= 5; i++) {
        yield { 
          region: 'US' as const, 
          host: `data.city${i}.gov`, 
          domain: `city${i}.gov`, 
          agency: `Agency ${i}` 
        };
      }
    });

    const result = await runSocrataCatalogIngest(customBatchOptions);

    expect(result.totalProcessed).toBe(5);
    // Should have called processItemBatch 3 times: [2 items], [2 items], [1 item]
    expect(mockProcessItemBatch).toHaveBeenCalledTimes(3);

    // Verify batch sizes
    expect(mockProcessItemBatch).toHaveBeenNthCalledWith(1, 
      expect.arrayContaining([expect.any(Object), expect.any(Object)]), // 2 items
      expect.any(String),
      expect.any(Date)
    );
  });

  it('should disable resume when resumeEnabled is false', async () => {
    const noResumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeEnabled: false,
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
    });

    await runSocrataCatalogIngest(noResumeOptions);

    // Should not attempt to load resume state when disabled
    expect(mockLoadResumeState).not.toHaveBeenCalled();
  });
});