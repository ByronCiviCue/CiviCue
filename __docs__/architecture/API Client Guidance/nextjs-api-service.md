# Next.js API Service (App Router)

Examples version: v0.1.0 — Updated: 2025-09-06

Use this track when you’re already in a Next.js app and want to co-locate JSON API routes and a docs page. For a pure JSON API without web pages, prefer the Railway Fastify/Hono service.

## Endpoints & Docs

- Routes under `app/api/v1/...` (Edge or Node runtime per dependency)
- Export OpenAPI at `app/api/openapi/route.ts`
- Render docs at `app/docs/page.tsx` with Redoc (or Swagger UI)

## Minimal Files (illustrative)

```ts
// app/api/v1/health/route.ts
export const runtime = 'node';
export async function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
```

```ts
// app/api/v1/reports/permits/route.ts
import { z } from 'zod';
export const runtime = 'node';
const Query = z.object({
  geo: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = Object.fromEntries(url.searchParams);
  const q = Query.parse(qs);
  // TODO: query DB/vector
  const payload = { data: [], meta: { page: q.page, limit: q.limit } };
  // ETag from content hash for client caching
  const etag = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))).then((b)=>Buffer.from(new Uint8Array(b)).toString('hex'));
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
  return Response.json(payload, { headers: { ETag: etag, 'Cache-Control': 'public, max-age=60' } });
}
```

```ts
// app/api/openapi/route.ts
import spec from '@/openapi.yaml' assert { type: 'json' };
export const runtime = 'node';
export async function GET() {
  return Response.json(spec);
}
```

```tsx
// app/docs/page.tsx
'use client';
export default function DocsPage() {
  return (
    <html>
      <head>
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
      </head>
      <body>
        <redoc spec-url="/api/openapi"></redoc>
      </body>
    </html>
  );
}
```

## Middleware: API Key & Rate Limit

- Middleware example (optional) at `middleware.ts` to guard `/api/v1/*`.
- For rate limiting, use a provider (e.g., Upstash Ratelimit) or implement per-route counters in Redis.

```ts
// middleware.ts (illustrative)
import { NextResponse } from 'next/server';
export function middleware(req: Request) {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith('/api/v1/')) {
    const key = req.headers.get('x-api-key');
    if (!key || key !== process.env.API_KEY) {
      return NextResponse.json({ type: 'about:blank', title: 'Unauthorized', status: 401 }, { status: 401, headers: { 'Content-Type': 'application/problem+json' } });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ['/api/v1/:path*'] };

## CORS and Preflight

For public JSON APIs, respond to preflight and set minimal CORS headers. Keep origins explicit.

```ts
// app/api/[...path]/route.ts (catch-all OPTIONS) or middleware.ts
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') || '';
  // TODO: validate origin against allowlist
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'x-api-key, content-type',
      'Access-Control-Expose-Headers': 'etag, x-correlation-id, x-ratelimit-remaining',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}
```
```

## Notes

- Validation at boundary with Zod; keep internals on pre-validated types.
- Choose `runtime = 'edge'` only when libraries support it; otherwise `node`.
- Use `openapi.yaml` in repo to drive `/api/openapi` and Postman generation (see openapi-postman-unification.md).
- For Redis/object cache and ETag patterns, see railway-api-service.md and api-architecture-guide.md (hash-based cache).
