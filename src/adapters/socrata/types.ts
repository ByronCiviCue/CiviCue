export interface RowClientOptions {
  domain: string;
  datasetId: string;
  limit?: number; // default 1000; clamp to [1, 1000]
  maxRows?: number;
  throttleMs?: number; // default 0
  retries?: number; // default 3
  retryBaseMs?: number; // default 250
  where?: string;
  order?: string;
  select?: string;
  extra?: Record<string, string | number | boolean>;
}

export interface PageResult {
  rows: unknown[];
  nextOffset?: number;
  totalFetched: number;
}

export type SocrataClientError =
  | { kind: 'RateLimited'; status: 429; url: string; retryAfterMs?: number; message: string }
  | { kind: 'HttpError'; status: number; url: string; message: string }
  | { kind: 'NetworkError'; url: string; message: string }
  | { kind: 'RetryExhausted'; url: string; attempts: number; message: string };

export type SocrataClientErrorWrapper = Error & { error: SocrataClientError };

export function createClientError(err: SocrataClientError): SocrataClientErrorWrapper {
  const e = new Error(err.message) as SocrataClientErrorWrapper;
  e.name = 'SocrataClientError';
  e.error = err;
  return e;
}

export function isSocrataClientError(e: unknown): e is SocrataClientErrorWrapper {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'SocrataClientError' && 'error' in (e as Record<string, unknown>);
}
