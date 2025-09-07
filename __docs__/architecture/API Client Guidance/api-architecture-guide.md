# API Architecture Guide

Examples version: v0.1.0 — Updated: 2025-09-06

Pragmatic guidance for designing, implementing, and operating API integrations—from simple clients to domain‑oriented branches and hybrid data surfaces. Focused on clarity, measurable outcomes, and survivable operations.

## Table of Contents

1. Foundational Principles
2. Pattern Selection
3. Architecture Overview
4. Core Patterns
5. Implementation Framework
6. Performance & SLOs
7. Security & Compliance
8. Versioning & Evolution
9. Testing Strategy
10. Operations & Runbooks
11. Anti‑Patterns
12. Migration Guides
13. Appendix: Measurement Recipes

## Foundational Principles

1) Semantic Domain Organization: Organize around business domains and tasks, not individual endpoints. A “branch” is a cohesive set of operations in one domain (e.g., products, reservations), exposing task‑level methods (search, getComplete) rather than raw endpoint mirroring.

2) Validate at the Boundary: Validate once at your public API surface. Internals operate on pre‑validated types. For internal invariants, use assertions/minimal checks. Generate schemas from a single source where possible to avoid drift.

3) Layered, Explicit Caching: Use domain‑aware caching with explicit keys/tags and clear invalidation triggers. Prefer a single source of truth for cache tags and avoid “cache everywhere”. Treat invalidation as a first‑class design problem.

4) Developer Experience: Favor predictable, documented, and easy‑to‑compose APIs. Use human‑friendly parameters and stable shapes. Wrap multi‑step client flows into semantic methods where it improves clarity.

5) Observable by Design: Ensure traceability and measurability. Correlation IDs, structured logs, and low‑cardinality metrics enable practical debugging and SRE workflows.

## Pattern Selection

- Traditional Client Pattern: < ~20 endpoints, limited orchestration, fast path for POCs or simple services.
- Branch‑Oriented Pattern: 20–250+ endpoints, multiple related domains, need server‑side orchestration and caching.
- Hybrid Data Surface: Mixed SQL + vector/semantic retrieval; when you must serve reports or search across structured and unstructured sources.

When not to use a branch layer: very simple or short‑lived integrations; client‑driven composition via GraphQL may be a better fit; or when latency budgets penalize added server hops.

## Architecture Overview

### Phase 1: Traditional API Integration (Simple)
Use for APIs with a small surface and minimal cross‑endpoint composition.

- Centralized client
- Boundary validation schemas
- Basic TTL caching (or none to start)
- Standardized errors

### Phase 2: Branch‑Oriented Pattern (Complex)
Use for larger APIs where operations naturally cluster by domain and benefit from server‑side composition and shared cache policy.

- Semantic domain branches (server‑side composition)
- Shared caching policy with tags
- Cross‑branch invalidation when resources change
- Declarative interfaces per branch

### Phase 3: Hybrid Data Surface (Advanced)
Use where you must fuse SQL and unstructured text/embeddings. Be explicit about relevance, provenance, and cost.

- Structured branches (SQL)
- Vector branches (pgvector, embeddings)
- Fusion branches (result ranking/combination)
- Analytics branches (reporting/insights)

## Core Patterns

### File Organization (example)

```
app/
├── api/                    # API Routes
│   └── [domain]/           # Route handlers (edge or server runtime)
├── [domain]/               # Domain logic
│   ├── branches/           # Business logic branches
│   ├── client/             # Integration client(s)
│   ├── cache/              # Cache policies & tags
│   ├── types/              # TypeScript definitions
│   └── schemas/            # Boundary validation schemas
└── lib/                    # Shared utilities
    ├── cache/              # Cache infra
    └── errors/             # Error handling
```

### Branch Implementation (sketch)

```typescript
class BranchImpl {
  async search(options: SearchOptions, context: Context): Promise<Result[]> {
    const key = this.buildKey(options);
    const cached = await cache.get(key, {
      staleWhileRevalidate: 300,
      revalidateFn: () => this.fetchFromAPI(options, context)
    });
    if (cached) return cached;

    const results = await this.fetchFromAPI(options, context);
    await cache.set(key, results, { ttl: 900, tags: this.tagsFor(options) });
    return results;
  }
}
```

### Validation Pattern (Edge or Server)

```javascript
export async function GET(request) {
  import { nanoid } from 'nanoid';
  const correlationId = nanoid();
  try {
    // Validate at boundary (edge or server runtime based on library support)
    const params = Schema.parse(parseParams(request.url));
    const data = await branch.operation(params, { correlationId });
    return Response.json({ success: true, data, meta: { correlationId } });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
```

### Cache Coordination

```typescript
class DomainAwareCache {
  async invalidate(strategy: InvalidationStrategy) {
    switch (strategy.type) {
      case 'resource':
        // Fan out to related branches
        return Promise.all([
          this.invalidateBranch('listings', `*${strategy.id}*`),
          this.invalidateBranch('calendar', `*${strategy.id}*`),
          this.invalidateBranch('reservations', `*resource:${strategy.id}*`)
        ]);
      case 'tag':
        return this.invalidateByTag(strategy.tag);
    }
  }
}
```

## Implementation Framework

1) Identify domain boundaries: name 3–8 branches that reflect tasks/users.
2) Design branch interfaces: semantic methods, not CRUD mirroring.
3) Implement validation at boundary: schemas for queries and bodies; transform human‑friendly params.
4) Add explicit caching: TTLs per data type; key normalization; tags for invalidation.
5) Orchestrate cross‑branch flows: contain orchestration to specific methods; avoid god‑objects.

### ID & Header Conventions (Agency Apps)

- IDs: prefer `nanoid()`; use UUID only when an external system mandates it.
- Correlation: propagate `X-Correlation-ID` end-to-end; generate with `nanoid()` if missing.
- Errors: respond with `application/problem+json` and include correlation ID in the envelope.

### Cache Tag Registry (pattern)

Establish a single module that defines how cache tags are derived and used across branches. Keep it deterministic and testable.

```typescript
// lib/cache/tags.ts
export type CacheTag =
  | `product:${string}`
  | `category:${string}`
  | `search:${string}`
  | `customer:${string}:orders`;

export const Tags = {
  product: (id: string): CacheTag => `product:${id}`,
  category: (id: string): CacheTag => `category:${id}`,
  search: (normQuery: string): CacheTag => `search:${normQuery}`,
  customerOrders: (id: string): CacheTag => `customer:${id}:orders`,
};

export function tagsForProductUpdate(id: string): CacheTag[] {
  return [Tags.product(id)];
}

export function tagsForOrderPlacement(customerId: string): CacheTag[] {
  return [Tags.customerOrders(customerId)];
}
```

Use these helpers in branches and invalidation paths; do not hand‑craft strings ad‑hoc.

### Idempotent Writes (pattern)

For write endpoints, accept an idempotency key and persist request outcome to avoid duplicate effects on retries.

```sql
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_status INT NOT NULL,
  response_body JSONB NOT NULL
);
```

```typescript
// route handler
const key = request.headers.get('Idempotency-Key');
if (!key) return json({ error: 'Missing Idempotency-Key' }, { status: 400 });
const found = await db.oneOrNone('SELECT * FROM idempotency_keys WHERE key=$1', [key]);
if (found) return json(found.response_body, { status: found.response_status });

const result = await ordersBranch.create(validated, ctx);
await db.none('INSERT INTO idempotency_keys(key, response_status, response_body) VALUES ($1,$2,$3)', [key, 201, result]);
return json(result, { status: 201 });
```

### Standard Error Shape

Adopt a consistent error envelope and include correlation IDs. Redact sensitive details.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [{ "path": ["field"], "message": "must be string" }],
    "correlationId": "..."
  }
}
```

### Minimal Metrics Helper

Use a small wrapper to standardize timers and tags. Back it with your APM of choice or a no‑op.

```typescript
// lib/metrics.ts
export function startTimer(name: string, tags: Record<string,string> = {}) {
  const t0 = Date.now();
  return {
    end(extra: Record<string,string> = {}) {
      const ms = Date.now() - t0;
      emit(name, ms, { ...tags, ...extra });
      return ms;
    }
  };
}

export function emit(name: string, value: number, tags: Record<string,string>) {
  // wire up to DataDog/OTel/Sentry… or console in dev
  if (process.env.NODE_ENV !== 'production') {
    console.debug('metric', { name, value, tags });
  }
}
```

## Performance & SLOs

Define targets per operation class; measure and tune.

- Validation: < 5–10ms at boundary
- Branch operations: < 25–75ms excluding I/O; track end‑to‑end P95 by route
- Cache hit rate: set per‑domain goals (e.g., popular search > 70%)
- Read API latency: P95 < 200ms typical; composite reads may be higher—document budgets
- Memory: enforce pagination/streaming for large responses

## Security & Compliance

- AuthN/Z: terminate at boundary; propagate least‑privilege tokens; rotate and scope secrets.
- Multi‑tenancy: namespace cache keys, data access, and logs; test isolation.
- Data handling: avoid caching PII; redact logs; document retention/residency.
- Rate limiting: per client/IP/key; idempotency for writes; timeouts/retries with budgets.

## Versioning & Evolution

- Prefer additive changes; version schemas and methods; document deprecations with dates.
- Provide compatibility windows and examples; use flags/dual‑write for risky changes.
- For consumers, publish change logs and test vectors.

## Testing Strategy

- Contract tests: boundary schemas, defaults, error shapes.
- Integration tests: orchestration and cache behavior, including invalidation.
- Resilience tests: timeouts, retries, degraded mode, circuit breakers.
- Performance tests: route‑level P95/P99 under representative load.

## Operations & Runbooks

- SLOs: state targets per route/branch; list dependencies and fallbacks.
- Incident playbooks: cache flush procedures, circuit breaker toggles, safe replays for idempotent writes.
- Observability: correlation IDs, structured logs, sampling, PII redaction.
- Capacity: connection pools, concurrency limits, backoff, cost tracking.

## Anti‑Patterns

- One branch per endpoint; branches should aggregate tasks.
- Re‑validating the same payload across multiple layers.
- Blanket caching without explicit invalidation.
- Central orchestrators that know everything; prefer composition.
- Assuming Edge runtime for libraries requiring Node APIs.

## Migration Guides

- New projects: start with branches where domains are clear; otherwise begin with traditional client and refactor once patterns emerge.
- Existing integrations: identify top‑value domains; implement 1–2 branches; add cache with tags; migrate incrementally; instrument and tune.

## Appendix: Measurement Recipes

- Cache hit rate: count hits/misses per key pattern and per branch; alert on sustained drops.
- Latency by dependency: attach upstream attributes; export P95 per dependency to spot regressions.
- Invalidation safety: unit test tag derivation and event‑driven invalidation; synthetic tests for cache coherence.

### Hash‑Based Object Cache Pattern (Reference)

- Content‑addressable objects: store canonical JSON under `cache:obj:{sha}` with long TTL.
- Lookup refs: `cache:ref:{ns}:{key}` point to `sha` with shorter TTL for SWR.
- Tags: `cache:tag:{tag}` → set of refs for targeted invalidation.
- ETag: use the content hash as `ETag`; support `If-None-Match` for bandwidth savings.
- Self‑healing: on missing/invalid object, re-fetch and re-write; return stale if fetch fails.

Benefits: minimal duplication, atomic ref updates, easy invalidation via tags, SWR without blocking clients.
