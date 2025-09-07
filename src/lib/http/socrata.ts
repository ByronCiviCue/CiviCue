import { socrataHeadersFor } from '../env-providers/socrata.js';

export async function socrataFetch(url: string, init: RequestInit = {}) {
  const u = new URL(url);
  const tokenHeaders = socrataHeadersFor(u.host);
  const baseHeaders: Record<string, string> = { Accept: 'application/json' };
  const merged = { ...baseHeaders, ...tokenHeaders, ...(init.headers as Record<string, string> | undefined) };
  return fetch(u.toString(), { ...init, headers: merged });
}

export function buildSocrataUrl(host: string, path: string, query?: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(`https://${host}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url;
}

export class SocrataHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly bodySnippet?: string
  ) {
    super(`Socrata ${status}: ${url}`);
  }
}

async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  throw new SocrataHttpError(res.status, res.url, text.slice(0, 512));
}

export { ensureOk };

