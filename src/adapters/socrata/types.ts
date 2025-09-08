// Error model used by tests and adapters
export type ClientErrorKind = 'HttpError' | 'RetryExhausted';

export interface ClientErrorShape {
  error: {
    kind: ClientErrorKind;
    status?: number;
    attempts?: number;
    url?: string;
    message?: string;
  };
}

// Runtime constructor used in http and in tests
export function createClientError(
  kind: ClientErrorKind,
  info: Partial<ClientErrorShape['error']> = {}
): ClientErrorShape {
  const { status, attempts, url, message } = info;
  return {
    error: {
      kind,
      ...(status ? { status } : {}),
      ...(attempts ? { attempts } : {}),
      ...(url ? { url } : {}),
      ...(message ? { message } : {}),
    },
  };
}

// Type guard/narrowing used in tests
export function isSocrataClientError(x: unknown): x is ClientErrorShape {
  if (!x || typeof x !== 'object') return false;
  const obj = x as { error?: { kind?: unknown } };
  return typeof obj.error?.kind === 'string';
}

// Row client types used by rowsClient.ts
export interface RowClientOptions {
  domain: string;          // e.g., data.sfgov.org
  datasetId: string;       // abcd-1234
  limit?: number;          // default enforced in client
  offset?: number;         // default 0
  extra?: Record<string, string | number | boolean>; // optional SoQL/QS extras
  // internal optional fields (present in implementation but not required by tests)
  maxRows?: number;
  throttleMs?: number;
  retries?: number;
  retryBaseMs?: number;
  where?: string;
  order?: string;
  select?: string;
}

export interface PageResult<T = unknown> {
  rows: T[];
  nextOffset?: number;     // undefined when no more pages
  // internal helper for rowsClient flow
  totalFetched?: number;
}

// Re-export normalized metadata types for consumers (non-breaking)
export type LogicalType =
  | 'text' | 'number' | 'checkbox'
  | 'date' | 'datetime'
  | 'money' | 'percent'
  | 'url' | 'email' | 'phone'
  | 'location' | 'point' | 'polygon'
  | 'json' | 'unknown';

export interface NormalizedColumn {
  id: number;
  name: string;
  fieldName: string;
  apiType: string;
  logicalType: LogicalType;
  nullable: boolean;
  hidden: boolean;
  description?: string;
}

export interface DatasetMetadata {
  id: string;
  domain: string;
  columns: NormalizedColumn[];
}
