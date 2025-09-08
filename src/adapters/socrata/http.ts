import { socrataFetch, buildSocrataUrl } from '../../lib/http/socrata.js';
import { createClientError, isSocrataClientError } from './types.js';

export interface RetryOptions {
  retries: number;
  retryBaseMs: number;
  jitter?: boolean | (() => number);
}

export interface FetchWithRetryOptions extends RetryOptions {
  url: string;
  init?: RequestInit;
}

export function calculateBackoffDelay(attempt: number, retryBaseMs: number, jitterOpt: RetryOptions['jitter'] = true): number {
  const exponentialDelay = retryBaseMs * Math.pow(2, attempt);
  const rand = typeof jitterOpt === 'function' ? jitterOpt() : (jitterOpt === false ? 0 : Math.random());
  const jitter = rand * retryBaseMs;
  return exponentialDelay + jitter;
}

export function parseRetryAfter(retryAfterValue: string): number | undefined {
  const seconds = parseInt(retryAfterValue, 10);
  if (!isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
  const date = new Date(retryAfterValue);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    if (delayMs > 0) return Math.min(delayMs, 30000);
  }
  return undefined;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(options: FetchWithRetryOptions): Promise<Response> {
  const { url, init = {}, retries, retryBaseMs } = options;

  async function scheduleRetryOnResponse(response: Response, attempt: number): Promise<boolean> {
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : undefined;
      if (attempt < retries) {
        const delayMs = retryAfterMs ?? calculateBackoffDelay(attempt, retryBaseMs, options.jitter);
        await sleep(delayMs);
        return true;
      }
      return false;
    }
    if (response.status >= 500) {
      if (attempt < retries) {
        const delayMs = calculateBackoffDelay(attempt, retryBaseMs, options.jitter);
        await sleep(delayMs);
        return true;
      }
      return false;
    }
    // For non-retryable statuses, throw immediately
    throw createClientError({ kind: 'HttpError', status: response.status, url, message: `HTTP error (${response.status}) for ${url}` });
  }

  async function scheduleRetryOnError(attempt: number): Promise<boolean> {
    if (attempt < retries) {
      const delayMs = calculateBackoffDelay(attempt, retryBaseMs, options.jitter);
      await sleep(delayMs);
      return true;
    }
    return false;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await socrataFetch(url, init);
      if (response.ok) return response;
      if (await scheduleRetryOnResponse(response, attempt)) continue;
    } catch (error) {
      if (isSocrataClientError(error)) throw error as Error;
      if (await scheduleRetryOnError(attempt)) continue;
    }
  }

  throw createClientError({ kind: 'RetryExhausted', url: options.url, attempts: options.retries + 1, message: `Retry exhausted after ${options.retries + 1} attempts for ${options.url}` });
}

export { buildSocrataUrl };
