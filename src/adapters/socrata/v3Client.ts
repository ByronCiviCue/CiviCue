import { socrataHeadersFor, socrataV3AuthHeader } from '../../lib/env-providers/socrata.js';
import { buildSocrataUrl, socrataFetch, SocrataHttpError } from '../../lib/http/socrata.js';
import { createClientError, isSocrataClientError } from './types.js';

export interface V3PostQueryInput {
  domain: string;
  datasetId: string; // abcd-1234
  soql: string; // full SoQL string
  pageNumber?: number; // default 1
  pageSize?: number; // default 1000
  includeSynthetic?: boolean; // default true
}

export interface V3PostQueryResult<T = unknown> {
  rows: T[];
  nextPageNumber?: number; // undefined when no more pages
  raw?: unknown;
}

export function isV3Unavailable(e: unknown): boolean {
  if (isSocrataClientError(e)) {
    const s = (e as { error: { status?: number } }).error.status;
    return s === 401 || s === 403 || s === 404 || s === 501;
  }
  if (e instanceof SocrataHttpError) {
    return e.status === 401 || e.status === 403 || e.status === 404 || e.status === 501;
  }
  return false;
}

export async function v3PostQuery<T = unknown>(input: V3PostQueryInput, signal?: AbortSignal): Promise<V3PostQueryResult<T>> {
  const { domain, datasetId } = input;
  const path = `/api/v3/views/${datasetId}/query.json`;
  const url = buildSocrataUrl(domain, path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...socrataHeadersFor(domain),
    ...socrataV3AuthHeader(domain, datasetId)
  };
  const size = Math.min(Math.max(input.pageSize ?? 1000, 1), 1000);
  const body = JSON.stringify({
    query: input.soql,
    page: { pageNumber: input.pageNumber ?? 1, pageSize: size },
    includeSynthetic: input.includeSynthetic ?? true
  });
  const res = await socrataFetch(url.toString(), { method: 'POST', headers, body, signal });
  if (!res.ok) {
    // Never include auth header in error; redact
    const safeUrl = res.url;
    throw createClientError('HttpError', { status: res.status, url: safeUrl, message: `HTTP error (${res.status}) for ${safeUrl}` });
  }
  const json: unknown = await res.json();
  const maybeObj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : undefined;
  let rows: unknown[] = [];
  if (maybeObj && Array.isArray((maybeObj as { data?: unknown }).data)) {
    rows = ((maybeObj as { data?: unknown }).data as unknown[]) ?? [];
  } else if (Array.isArray(json as unknown[])) {
    rows = json as unknown[];
  }
  const nextPageNumber = rows.length === size ? (input.pageNumber ?? 1) + 1 : undefined;
  return { rows: rows as T[], nextPageNumber, raw: json };
}

export async function v3PostAll<T = unknown>(
  domain: string,
  datasetId: string,
  req: { query: string; includeSynthetic?: boolean; pageSize?: number },
  signal?: AbortSignal
): Promise<T[]> {
  const size = Math.min(Math.max(req.pageSize ?? 1000, 1), 1000);
  const out: T[] = [];
  let pageNumber = 1;
  // Loop until we receive a short page
  while (true) {
    const { rows } = await v3PostQuery<T>({ domain, datasetId, soql: req.query, pageNumber, pageSize: size, includeSynthetic: req.includeSynthetic }, signal);
    out.push(...rows);
    if (rows.length < size) break;
    pageNumber += 1;
  }
  return out;
}
