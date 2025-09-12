export type IngestRegion = 'US' | 'EU';

export interface SocrataCatalogIngestOptions {
  regions: IngestRegion[];
  pageSize: number;
  limit: number;
  dryRun: boolean;
  resumeFrom?: string | null;
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
