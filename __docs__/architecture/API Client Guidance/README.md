# API Docs Overview

Docs version: v0.1.0
Last updated: 2025-09-06

Purpose-built, pragmatic documentation for designing, implementing, and operating JSON-only APIs. These docs prioritize clarity, measurable outcomes, and survivable operations. They avoid hype and focus on patterns that hold up in production.

## Who This Is For

- Engineers building or operating API integrations and public APIs
- Architects choosing between traditional, branch-oriented, or hybrid data patterns
- Teams deploying small API services on Railway (Fastify/Hono)

## How To Use These Docs

- Start with Patterns & Evaluation to choose an approach.
- Use Implementation and Railway guides to stand up services quickly.
- Reference Hybrid Data when fusing SQL + vectors.
- Keep OpenAPI as the source of truth and sync Postman collections from it.

## Index

- Patterns & Evaluation
  - api-architecture-guide.md: Practical patterns, SLOs, security, versioning, testing, ops
  - api-patterns-evaluation.md: Fit, tradeoffs, risk mitigations, measurement
- Implementation
  - api-implementation-guide.md: Boundary validation, caching, orchestration, testing (Vitest)
  - railway-api-service.md: Railway Fastify/Hono service patterns, docs hosting, OpenAPI
  - nextjs-api-service.md: Next.js API routes (app router), OpenAPI export, docs page
- Hybrid Data
  - 31-hybrid-data-api-surface-design.md: SF municipal APIs + PDFs, ingestion, fusion, SLOs, OpenAPI excerpt
- OpenAPI & Postman
  - openapi-postman-unification.md: Keep OpenAPI as source of truth, generate/sync Postman, run collections in CI
- Caching & Performance
  - 31-caching-architecture.md: Layered caching patterns (edge/app/browser) and metrics
- Source Context
  - 24-api-patterns.md: Original traditional client patterns
  - 30-next-generation-api-patterns.md: Earlier branch‑oriented write‑ups (superseded by current guides)

## Conventions

- Versioned routes from day one (e.g., `/v1/...`).
- RFC7807 errors (`application/problem+json`) on failures.
- `X-Correlation-ID` on requests/responses; pass through to dependencies.
- IDs and correlation: prefer `nanoid()`; use UUID only when required by external systems.
- API keys via `x-api-key` header; keys stored hashed.
- Caching: use content-hash ETag on deterministic responses; support `If-None-Match`.
- Rate limit headers: include `X-RateLimit-Remaining`, `Retry-After` when applicable.
- Cache tags: use `type:value` format (e.g., `source:dept_public_works`, `entity:permit:123`).
- CORS: allow only known origins; expose `ETag`, `X-Correlation-ID`, `X-RateLimit-Remaining`; set `Vary: Origin`.

## Agency App Consistency

- Headers: always include `X-Correlation-ID`; set ETag where possible.
- Errors: Problem+JSON across all services.
- IDs: nanoid for internal IDs and correlation; only use UUID where interoperability requires.
- Observability: low-cardinality metrics (route, status, cache_hit) and minimal, privacy-safe logs.

## Quick Links

- API Service (Railway) skeleton: railway-api-service.md (examples v0.1.0, 2025-09-06)
- Next.js API skeleton: nextjs-api-service.md (examples v0.1.0, 2025-09-06)
- Hybrid API surface (SF project): 31-hybrid-data-api-surface-design.md
- OpenAPI → Postman workflow: openapi-postman-unification.md (v0.1.0, 2025-09-06)

## Dual Track Map (Next.js vs Service)

- Choose Next.js when:
  - You already run a Next app and want to co-locate API routes and a docs page.
  - You need server-rendered guides or UI alongside the API.
  - Deployment target is Vercel or a Next-optimized environment.
- Choose Fastify/Hono service (Railway) when:
  - You want a small, JSON-only API with built-in OpenAPI/Swagger.
  - You prefer simple process-level CORS/keys/rate limits and containerized deploys.
  - You need separate scaling and concerns for API vs website.
