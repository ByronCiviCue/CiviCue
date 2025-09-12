export type IngestRegion = 'US' | 'EU';

export type ErrorClassification = 'TRANSIENT' | 'FATAL';

export interface RetryConfig {
  max_attempts: number;      // Default: 3
  base_delay_ms: number;     // Default: 1000  
  max_delay_ms: number;      // Default: 30000
  enable_jitter: boolean;    // Default: true
}

export interface SocrataCatalogIngestOptions {
  regions: IngestRegion[];
  pageSize: number;
  limit: number;
  dryRun: boolean;
  resumeFrom?: string | null;
  retryConfig?: Partial<RetryConfig>;
  batchSize?: number;        // Default: 100
  resumeEnabled?: boolean;   // Default: true
  logger?: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug?(...args: unknown[]): void;
  };
  now?: () => Date;
}

export interface SocrataCatalogIngestResult {
  startedAt: string;
  finishedAt: string;
  plannedRegions: IngestRegion[];
  plannedPageSize: number;
  plannedLimit: number;
  dryRun: boolean;
  resumeFrom?: string | null;
  totalProcessed: number;
  lastCursor?: string | null;
  completedRegions: IngestRegion[];
}

export class SocrataCatalogIngestError extends Error {
  constructor(
    public code: 'CONFIG' | 'RUNTIME',
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'SocrataCatalogIngestError';
  }
}
