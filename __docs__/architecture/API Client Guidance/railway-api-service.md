# Railway JSON API Service (Fastify/Hono)

Practical patterns for deploying a small, JSON‑only public API on Railway with built‑in docs, API keys, rate limits, and versioned routes. Skip Next.js — this is an API service, not a website.

Examples version: v0.1.0 — Updated: 2025-09-06

## Option A: Single Service (Fastify) — API + Auto‑Docs

- Server: Fastify (TypeScript)
- Docs: Serve `/openapi.json` and `/docs` (Swagger UI) from the same process
- Essentials: CORS, rate limit, API keys, versioned routes, RFC7807 errors, ETag

Minimal server (illustrative; v0.1.0 — 2025-09-06)

```ts
// server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
// import fastifyEtag from '@fastify/etag'; // optional if you want auto-ETag

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Use API key for rate-limit identity when available
  keyGenerator: (req) => (req.headers['x-api-key'] as string) || req.ip,
});

// Recommended CORS hardening for public JSON APIs (set origin list in env)
// await app.register(cors, {
//   origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)),
//   methods: ['GET','HEAD','OPTIONS'],
//   allowedHeaders: ['x-api-key','content-type'],
//   exposedHeaders: ['etag','x-correlation-id','x-ratelimit-remaining'],
//   maxAge: 86400,
// });

await app.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: { title: 'Example API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
      schemas: problemJsonSchema(),
    },
  },
});
await app.register(swaggerUI, { routePrefix: '/docs' });
// await app.register(fastifyEtag); // if enabling ETag plugin

// Simple API-key guard (header: x-api-key) for /v1/*
app.addHook('onRequest', async (req, reply) => {
  if (req.routerPath?.startsWith('/v1') && req.method !== 'OPTIONS') {
    const key = req.headers['x-api-key'];
    if (!key || !(await isValid(key))) {
      return reply
        .code(401)
        .type('application/problem+json')
        .send(problemJson('https://api.example.com/problems/invalid_api_key', 'Unauthorized', 401, 'invalid_api_key'));
    }
  }
});

// OpenAPI JSON
app.get('/openapi.json', async () => app.swagger());

// Health
app.get('/v1/health', {
  schema: {
    summary: 'Liveness/health check',
    response: { 200: { type: 'object', properties: { ok: { type: 'boolean' }, time: { type: 'string', format: 'date-time' } } } },
  },
}, async () => ({ ok: true, time: new Date().toISOString() }));

// Reports: permits
app.get('/v1/reports/permits', {
  schema: {
    summary: 'Permit rollup by filters',
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: 'object',
      properties: {
        geo: { type: 'string', description: 'Geo filter (WKT or bbox)' },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        status: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
    },
    response: {
      200: permitsResponseSchema(),
      401: { $ref: 'problem#' },
      429: { $ref: 'problem#' },
      500: { $ref: 'problem#' },
    },
  },
}, async (req, reply) => {
  // TODO: hydrate from Postgres/pgvector; add Cache-Control/ETag if stable
  // If using fastifyEtag, app decorates reply with ETag automatically
  reply.header('Cache-Control', 'public, max-age=60');
  return { data: [{ id: 'perm_1', address: '123 Main', status: 'issued', sources: ['dept_public_works'], provenance: { system: 'dept_public_works', retrieved_at: new Date().toISOString(), license: 'CC-BY' }, freshness: 0.98, trust_score: 0.9 }], meta: { correlationId: req.id, page: 1, limit: 50, stale_at: new Date(Date.now() + 60_000).toISOString() } };
});

// Hybrid search
app.get('/v1/search/hybrid', {
  schema: {
    summary: 'Hybrid search across structured and unstructured sources',
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: 'object', required: ['q'],
      properties: {
        q: { type: 'string' },
        department: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    response: {
      200: hybridResponseSchema(),
      401: { $ref: 'problem#' },
      429: { $ref: 'problem#' },
      500: { $ref: 'problem#' },
    },
  },
}, async (req, reply) => {
  reply.header('Cache-Control', 'public, max-age=60');
  return { data: [{ id: 'doc_1', title: 'Street Closure Notice', sources: ['police', 'pdf'], provenance: { system: 'police', retrieved_at: new Date().toISOString(), license: 'Public' }, freshness: 0.95, trust_score: 0.85 }], meta: { correlationId: req.id, page: 1, limit: 20, stale_at: new Date(Date.now() + 60_000).toISOString() } };
});

await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });

// --- helpers ---
function problemJsonSchema() {
  return {
    problem: {
      $id: 'problem',
      type: 'object',
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'integer' },
        detail: { type: 'string' },
        instance: { type: 'string' },
      },
      required: ['type', 'title', 'status'],
    },
  } as const;
}

function permitsResponseSchema() {
  return {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, address: { type: 'string' }, status: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' } },
            provenance: { type: 'object', properties: { system: { type: 'string' }, retrieved_at: { type: 'string', format: 'date-time' }, license: { type: 'string' } } },
            freshness: { type: 'number' }, trust_score: { type: 'number' },
          },
          required: ['id'],
        },
      },
      meta: { type: 'object', properties: { correlationId: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' }, stale_at: { type: 'string', format: 'date-time' } } },
    },
  } as const;
}

function hybridResponseSchema() {
  return {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, title: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' } },
            provenance: { type: 'object', properties: { system: { type: 'string' }, retrieved_at: { type: 'string', format: 'date-time' }, license: { type: 'string' } } },
            freshness: { type: 'number' }, trust_score: { type: 'number' },
          },
          required: ['id'],
        },
      },
      meta: { type: 'object', properties: { correlationId: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' }, stale_at: { type: 'string', format: 'date-time' } } },
    },
  } as const;
}

function problemJson(type: string, title: string, status: number, detail?: string) {
  return { type, title, status, detail };
}

async function isValid(key: any) {
  return process.env.API_KEY && key === process.env.API_KEY;
}
```

Curl examples (v0.1.0 — 2025-09-06)

```bash
# Health (no key)
curl -s https://api.example.com/v1/health

# Permits (API key)
curl -s -H 'x-api-key: YOUR_KEY' 'https://api.example.com/v1/reports/permits?status=issued&limit=10'

# Hybrid search with ETag
ETAG=$(curl -s -D - -H 'x-api-key: YOUR_KEY' 'https://api.example.com/v1/search/hybrid?q=street%20closure' | awk '/etag:/ {print $2}')
curl -s -H 'x-api-key: YOUR_KEY' -H "If-None-Match: $ETAG" 'https://api.example.com/v1/search/hybrid?q=street%20closure' -o /dev/null -w '%{http_code}\n'
```

OpenAPI (excerpt for three endpoints; v0.1.0 — 2025-09-06)

```yaml
openapi: 3.0.3
info: { title: Example API, version: 1.0.0 }
servers:
  - url: https://api.example.com
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
  schemas:
    Problem:
      type: object
      required: [type, title, status]
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string }
  responses:
    Error401:
      description: Unauthorized
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Error429:
      description: Too Many Requests
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Error500:
      description: Internal Server Error
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
paths:
  /v1/health:
    get:
      summary: Liveness
      responses:
        '200':
          description: OK
  /v1/reports/permits:
    get:
      summary: Permit rollup by filters
      security: [{ ApiKeyAuth: [] }]
      parameters:
        - { name: geo, in: query, schema: { type: string } }
        - { name: from, in: query, schema: { type: string, format: date-time } }
        - { name: to, in: query, schema: { type: string, format: date-time } }
        - { name: status, in: query, schema: { type: string } }
        - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
      responses:
        '200': { description: OK }
        '401': { $ref: '#/components/responses/Error401' }
        '429': { $ref: '#/components/responses/Error429' }
        '500': { $ref: '#/components/responses/Error500' }
  /v1/search/hybrid:
    get:
      summary: Hybrid search across structured and unstructured sources
      security: [{ ApiKeyAuth: [] }]
      parameters:
        - { name: q, in: query, required: true, schema: { type: string } }
        - { name: department, in: query, schema: { type: string } }
        - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
      responses:
        '200': { description: OK }
        '401': { $ref: '#/components/responses/Error401' }
        '429': { $ref: '#/components/responses/Error429' }
        '500': { $ref: '#/components/responses/Error500' }
```

Railway checklist

- Service → Deploy from repo; Railway sets `PORT` automatically.
- Env vars: `DATABASE_URL`, `REDIS_URL`, `API_KEY`, any upstream creds.
- Healthcheck: `/v1/health`.
- Domains: use default `*.up.railway.app` or bind `api.example.com`.
- Scaling: start with 1–3 replicas; consider Redis cache for heavy GETs.
- CORS: allow your docs host and web app origin.
- Rate limits: configure `@fastify/rate-limit` with API-key based keyGenerator.
- Errors: return RFC7807 `application/problem+json`.
- ETag/Cache: set Cache-Control on deterministic reads; support `If-None-Match`.

## Option B: Split — API Service + Static Docs

- Service A (API): Fastify as above; serve only JSON + `/openapi.json`.
- Service B (Docs): Railway Static; a themed doc portal that loads `/openapi.json` from Service A.

Minimal Redoc `index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Example API</title>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
  </head>
  <body>
    <redoc spec-url="https://api.example.com/openapi.json"></redoc>
  </body>
  </html>
```

CORS for split setup

- On API service, allow the docs domain in CORS: `origin: [/docs\.yourdomain\.com$/]` or exact string.
- Keep API responses JSON only; put guides, keys, examples in the static site.

## API Keys: Storage, Rotation, Per‑Key Limits

Store hashed API keys, support rotation, and allow per‑key rate limits.

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,               -- generated by server using nanoid
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,           -- argon2id/bcrypt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  rate_limit_per_minute INT DEFAULT 100,
  metadata JSONB
);
```

Verification (argoned):

```ts
import argon2 from 'argon2';
async function isValid(key: string) {
  const rec = await db.oneOrNone('SELECT id, key_hash, rate_limit_per_minute FROM api_keys WHERE revoked_at IS NULL AND id = (SELECT id FROM api_keys ORDER BY created_at DESC LIMIT 1)');
  if (!rec) return false;
  const ok = await argon2.verify(rec.key_hash, key);
  if (ok) (globalThis as any).keyRateLimit = rec.rate_limit_per_minute; // example
  return ok;
}
```

Per‑key rate limit with Fastify:

```ts
await app.register(rateLimit, {
  hook: 'onSend',
  keyGenerator: (req) => (req.headers['x-api-key'] as string) || req.ip,
  max: (_req) => (globalThis as any).keyRateLimit || 100,
  timeWindow: '1 minute',
});
```

Rotation policy: generate opaque keys (e.g., `ck_...`), display plaintext once, publish new key, then revoke old after grace period.

## Hono Variant (zod‑openapi)

Define schemas once, generate OpenAPI automatically, and serve docs.

```ts
// app.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { z } from 'zod';

const app = new OpenAPIHono();

// Security scheme
app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey', in: 'header', name: 'x-api-key'
});

// Health
app.openapi(
  {
    method: 'get', path: '/v1/health',
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean(), time: z.string() }) } } } }
  },
  (c) => c.json({ ok: true, time: new Date().toISOString() })
);

// Reports: permits
const PermitsQuery = z.object({
  geo: z.string().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  status: z.string().optional(), page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(50)
});
const PermitsItem = z.object({ id: z.string(), address: z.string().optional(), status: z.string().optional(), sources: z.array(z.string()).optional(), provenance: z.object({ system: z.string(), retrieved_at: z.string(), license: z.string().optional() }).optional(), freshness: z.number().optional(), trust_score: z.number().optional() });
const PaginatedPermits = z.object({ data: z.array(PermitsItem), meta: z.object({ correlationId: z.string().optional(), page: z.number(), limit: z.number(), stale_at: z.string().optional() }) });

app.openapi(
  {
    method: 'get', path: '/v1/reports/permits',
    request: { query: PermitsQuery },
    security: [{ ApiKeyAuth: [] }],
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: PaginatedPermits } } } }
  },
  (c) => c.json({ data: [], meta: { page: 1, limit: 50 } })
);

// Hybrid search
const HybridQuery = z.object({ q: z.string(), department: z.string().optional(), page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(20) });
const HybridItem = z.object({ id: z.string(), title: z.string().optional(), sources: z.array(z.string()).optional(), provenance: z.object({ system: z.string(), retrieved_at: z.string(), license: z.string().optional() }).optional(), freshness: z.number().optional(), trust_score: z.number().optional() });
const PaginatedHybrid = z.object({ data: z.array(HybridItem), meta: z.object({ correlationId: z.string().optional(), page: z.number(), limit: z.number(), stale_at: z.string().optional() }) });

app.openapi(
  {
    method: 'get', path: '/v1/search/hybrid',
    request: { query: HybridQuery },
    security: [{ ApiKeyAuth: [] }],
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: PaginatedHybrid } } } }
  },
  (c) => c.json({ data: [], meta: { page: 1, limit: 20 } })
);

// Docs
app.doc('/openapi.json', { openapi: '3.0.3', info: { title: 'Example API', version: '1.0.0' } });
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default app;
```

## Notes & Tips

- Versioning: prefix routes with `/v1` from day one. Use additive changes; avoid breaking changes without a new version.
- API keys: store hashed keys; rotate via ops script; consider per‑key rate limits and usage logs later.
- Observability: include `X-RateLimit-Remaining` headers and `X-Correlation-ID` in responses; log with correlation and route tags.
- Security: never echo secrets; redact logs; restrict origins; consider a read‑only CF cache for public endpoints.

## Redis/Object Cache for Fast Performance

Use a Redis-backed object cache with content hashes and references. This enables quick reads, SWR refresh, ETag alignment, and self-healing.

### Redis Setup

- Provision Redis on Railway (or Upstash). Set `REDIS_URL`.
- Suggested libs: `ioredis` or `@upstash/redis` (HTTP-based).

### Keyspaces

- Objects (content-addressable): `cache:obj:{sha}` → JSON blob, TTL long (e.g., 24h+)
- Refs (lookup): `cache:ref:{ns}:{key}` → `{ sha, meta }`, TTL shorter (e.g., 5–15m)
- Tags → refs (for invalidation): `cache:tag:{tag}` is a Set of ref keys

This decouples object storage from lookup. Multiple refs can point to the same object by content hash. Updating a ref atomically switches to a new object without rewriting large values.

### Hash-Based Object Cache Helper (illustrative)

```ts
// cache.ts
import crypto from 'crypto';

function stableStringify(v: unknown) {
  return JSON.stringify(v, Object.keys(v as any).sort());
}

function sha(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function getOrRevalidate<T>(
  ns: string,
  key: string,
  tags: string[],
  ttlRefSec: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; etag: string; cacheHit: boolean }> {
  const refKey = `cache:ref:${ns}:${key}`;
  const ref = await redis.hgetall(refKey);
  if (ref?.sha) {
    const objKey = `cache:obj:${ref.sha}`;
    const blob = await redis.get(objKey);
    if (blob) {
      // SWR: if ref is near expiry, refresh in background
      const ttl = await redis.ttl(refKey);
      if (ttl > -1 && ttl < Math.floor(ttlRefSec / 3)) void refresh();
      return { data: JSON.parse(blob), etag: ref.sha, cacheHit: true };
    }
  }
  return await refresh();

  async function refresh() {
    const fresh = await fetcher();
    const payload = stableStringify(fresh);
    const etag = sha(payload);
    await redis.set(`cache:obj:${etag}`, payload, 'EX', 60 * 60 * 24); // long TTL
    await redis.hset(refKey, { sha: etag, t: Date.now().toString() });
    await redis.expire(refKey, ttlRefSec);
    // map tags → ref for invalidation
    await Promise.all(tags.map(tag => redis.sadd(`cache:tag:${tag}`, refKey)));
    return { data: fresh, etag, cacheHit: false };
  }
}

export async function invalidateByTag(tag: string) {
  const setKey = `cache:tag:${tag}`;
  const refs = await redis.smembers(setKey);
  if (refs.length) await redis.del(...refs); // drop refs; objects GC by TTL
  await redis.del(setKey);
}
```

### Using ETag with Hash Cache

- Set `ETag` header to the object hash (`etag`).
- Support `If-None-Match` to return `304` cheaply when unchanged.
- Clients get consistency with server cache and avoid over-fetching.

Example (Fastify route):

```ts
const { data, etag, cacheHit } = await getOrRevalidate(
  'reports',
  normalizeKey(req.query),
  deriveTags(req.query),
  300,
  () => computeReport(req.query)
);
reply.header('ETag', etag);
reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
if (req.headers['if-none-match'] === etag) return reply.code(304).send();
return reply.send({ data, meta: { correlationId: req.id, cacheHit } });
```

### Self-Healing Refresh

- If the object is missing or parse fails, the helper re-fetches and re-writes (`refresh()`).
- SWR: refs refresh in the background when near expiry; stale data is returned immediately with a short TTL.
- Invalidation by tag deletes refs, not large objects; refs repopulate on next read.

## Logflare Integration (Sensible Defaults)

If you’re using Logflare for structured logs, keep it minimal and privacy-safe.

- Env: `LOGFLARE_API_KEY`, `LOGFLARE_SOURCE_TOKEN`.
- Log fields: `ts`, `level`, `message`, `correlationId`, `route`, `status`, `latency_ms`, `cache_hit`.
- Sampling: log only slow requests (e.g., >200ms) and errors; sample a small percentage of success.

Example emitter (illustrative):

```ts
async function logflare(event: Record<string, any>) {
  if (!process.env.LOGFLARE_API_KEY || !process.env.LOGFLARE_SOURCE_TOKEN) return;
  const body = [{
    log_entry: event.message || 'event',
    metadata: { ...event, message: undefined },
  }];
  await fetch('https://api.logflare.app/logs', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.LOGFLARE_API_KEY,
      'X-Source-Token': process.env.LOGFLARE_SOURCE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// Usage in a route
const timer = Date.now();
reply.hook('onSend', async (_req, reply) => {
  const latency = Date.now() - timer;
  const status = reply.statusCode;
  const shouldSample = status >= 500 || latency > 200 || Math.random() < 0.02;
  if (shouldSample) {
    void logflare({
      message: 'request',
      correlationId: _req.id,
      route: _req.routerPath,
      status,
      latency_ms: latency,
      cache_hit: reply.getHeader('X-Cache-Hit') || false,
    });
  }
});
```

Notes

- Redact PII and secrets; don’t log request bodies unless essential and scrubbed.
- Keep metadata cardinality low for cost and queryability.
