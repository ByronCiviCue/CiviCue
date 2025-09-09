import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Mode = 'record' | 'replay' | 'passthrough';

interface CassetteEntry {
  request: { url: string; method: string; body?: any; headers?: Record<string, string> };
  response: { status: number; headers?: Record<string, string>; body: any };
}

interface CassetteFile {
  mode: Mode;
  entries: CassetteEntry[];
}

function cassettePath(name: string): string {
  return resolve(process.cwd(), 'tests/fixtures/cassettes', `${name}.json`);
}

function normalizeMethod(m?: string): string {
  return (m || 'GET').toUpperCase();
}

function allowedHeadersFrom(init?: RequestInit): Record<string, string> | undefined {
  if (!init?.headers) return undefined;
  const src = init.headers as Record<string, string>;
  const allow = new Set(['accept', 'content-type', 'x-app-token']);
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(src)) {
    const keyLc = k.toLowerCase();
    if (!allow.has(keyLc)) continue;
    // Normalize key casing to the whitelisted, lowercased form
    pairs.push([keyLc, String(v)]);
  }
  const out = Object.fromEntries(pairs) as Record<string, string>;
  return pairs.length ? out : undefined;
}

function serializeBody(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  // Common non-string bodies
  if (typeof Buffer !== 'undefined' && (body as any).buffer) return '[binary body]';
  if (typeof FormData !== 'undefined' && body instanceof FormData) return '[binary body]';
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return '[binary body]';
  // Try JSON stringify for plain objects
  try {
    return JSON.stringify(body);
  } catch {
    return '[binary body]';
  }
}

export async function withCassette<T>(
  testName: string,
  fn: () => Promise<T>,
  opts: { mode?: Mode } = {}
): Promise<T> {
  const mode: Mode = opts.mode || (process.env.CASSETTE_MODE as Mode) || 'replay';
  const path = cassettePath(testName);
  const originalFetch = globalThis.fetch;

  if (mode === 'passthrough') {
    return fn();
  }

  if (mode === 'record') {
    const entries: CassetteEntry[] = [];
    const recordFetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response> = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const method = normalizeMethod(init?.method);
      const reqBody = serializeBody(init?.body);
      const headersObj = allowedHeadersFrom(init);
      const res = await originalFetch(input, init);
      const cloned = res.clone();
      const ctype = res.headers.get('content-type') || '';
      const body: any = ctype.includes('application/json')
        ? await cloned.json().catch(() => null)
        : await cloned.text().catch(() => '');
      entries.push({ request: { url, method, body: reqBody, headers: headersObj }, response: { status: res.status, headers: Object.fromEntries(res.headers.entries()), body } });
      return res;
    };
    globalThis.fetch = recordFetch;

    try {
      const result = await fn();
      await fs.mkdir(dirname(path), { recursive: true });
      if (entries.length > 50) {
        throw new Error(`Cassette too large: ${entries.length} entries (>50). Shrink or split the fixture: ${path}`);
      }
      const file: CassetteFile = { mode: 'replay', entries };
      const payload = JSON.stringify(file, null, 2);
      if (payload.length > 200_000) {
        throw new Error(`Cassette payload too large: ${(payload.length / 1024).toFixed(1)}KB (>200KB). Reduce fixture size: ${path}`);
      }
      await fs.writeFile(path, payload, 'utf8');
      return result;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // replay
  const json = await fs.readFile(path, 'utf8').then((s) => JSON.parse(s) as CassetteFile);
  const queue = [...json.entries];
  const replayFetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response> = async (input, init) => {
    const next = queue.shift();
    if (!next) return new Response('No cassette entry', { status: 500 });
    // Validate request line
    const gotUrl = typeof input === 'string' ? input : (input as URL).toString();
    const gotMethod = normalizeMethod(init?.method);
    if (gotUrl !== next.request.url || gotMethod !== next.request.method) {
      throw new Error(`Cassette mismatch. Expected ${next.request.method} ${next.request.url} but got ${gotMethod} ${gotUrl}`);
    }
    const headers = new Headers(next.response.headers || { 'content-type': 'application/json' });
    const body = headers.get('content-type')?.includes('application/json') ? JSON.stringify(next.response.body ?? null) : String(next.response.body ?? '');
    return new Response(body, { status: next.response.status, headers });
  };
  globalThis.fetch = replayFetch;

  try {
    const result = await fn();
    return result;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
