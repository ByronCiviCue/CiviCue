import { socrataHeadersFor } from '../env-providers/socrata.js';

export async function socrataFetch(url: string, init: RequestInit = {}) {
  const u = new URL(url);
  const tokenHeaders = socrataHeadersFor(u.host);
  const baseHeaders: Record<string, string> = { Accept: 'application/json' };
  const merged = { ...baseHeaders, ...tokenHeaders, ...(init.headers as Record<string, string> | undefined) };
  return fetch(u.toString(), { ...init, headers: merged });
}

