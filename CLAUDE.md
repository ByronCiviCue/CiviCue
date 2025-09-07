# CLAUDE.md — CiviCue

This repo is an **API + branch engine** that normalizes municipal data (Socrata, CKAN, ArcGIS) into a consistent shape for:
- **Public API routes** (OpenAPI-first),
- **Branch synthesis** (plan → fetch → fuse),
- **Vector ingestion** (pgvector embeddings).

Claude operates in two personas:
- **Opus (Plan mode)** → produce structured plans, tasks, RFC scaffolds.
- **Sonnet (Implement mode)** → write code, diffs, tests, and scripts.

The Architect (reviewer) enforces standards with staged diffs, a Confession Report, and a Defense Statement.

---

## 0) Laws (non-negotiable)

- **OpenAPI is the contract.** Import generated TS types for routes. No ad-hoc DTOs.
- **TypeScript strict.** No `any`, no implicit `any`, no `// @ts-ignore`.
- **Runtime validation at boundaries.** Zod schemas for all external data (adapters).
- **I/O policy.** Every network call has **timeout**, **retry with backoff** (429/5xx), and bounded **pagination**.
- **Normalized items.** Every branch item includes `sources[]`, `provenance{system,retrieved_at,license?}`, `freshness`, `trust_score`.
- **No TODO/FIXME in production paths.** Confess or implement; no placeholders.
- **Secrets are server-only.** Never leak tokens to client bundles or logs.

---

## 1) Modes & Output Contracts

### OPUS — Plan Mode (use for tasking & RFCs)
**Goal:** produce plans/tasks/RFC scaffolds—no code.

**Output exactly:**
1. **Task list** for Task Master:  
   `T-### | <Title> | <DependsOn IDs or blank> | phase:<...>,area:<...>,prio:P1|P2`
2. **Dependency wiring** lines (CLI):  
   `tm add-dependency --id=<child> --depends-on=<parent>`
3. (If RFC) a short RFC scaffold with sections: Objective, Options, Decision, Risks.

> Do not emit code in Opus mode.

---

### SONNET — Implement Mode (use for code & diffs)
**Goal:** implement selected tasks—code only, minimal commentary.

**You MUST output:**
1. **Unified diffs** for changed files (patch format).
2. **New files list** (explicit paths).
3. **Exact commands to verify:**  
   ```
   pnpm typecheck && pnpm test
   npx @redocly/cli lint openapi.yaml
   ```
4. If migrations/scripts: the command to run, idempotent.

> No prose outside those sections. No invention of files not listed under “targets” in the prompt.

---

## 2) Repository Context (what matters to Claude)

- **Adapters**: `/api/adapters/{socrata|ckan|arcgis}/`
- **Branch engine**: `/api/branches/<jurisdiction.topic>/` with `plan.ts`, `fetch.ts`, `fuse.ts`
- **Routes**: `/api/v1/...` thin controllers using OpenAPI types
- **Jobs**: `/jobs/ingest-branch.ts` → upsert to Postgres + pgvector
- **Docs**: `__docs__/...` (plans, RFCs, profiles)
- **Task Master** plan: `__docs__/plans/taskmaster-plan.txt`

**tsconfig:** will migrate to ESM (NodeNext) via a cohesive diff (scripts, tests, imports) — never piecemeal.

---

## 3) Staging Protocol (review boundary)

- All work is reviewed from **staged diffs** only: `git diff --staged`.
- Two required docs must be staged last:
  - `__review__/CONFESSION.md` (Pre-flight Checklist & Confession)
  - `__review__/DEFENSE.md` (Defense Statement)

**Confession template** (fill every box):
```
# Pre-flight Checklist & Confession
## Deviations & Placeholders
- TODOs present: <file:line or "none">
- Stubs/mocks: <...>
- Missing tests: <...>
- Unvalidated env reads: <...>
- Rate-limit/backoff gaps: <...>
- OpenAPI mismatch: <...>
- Performance landmines: <...>

## Surface & Context
Feature/Module: ...
Related RFC/Doc: ...
Scope: files/endpoints/branches ...
Risk: low|medium|high (why)

## Invariants Claimed
- OpenAPI conformance: yes/no
- I/O timeouts: <values>
- Retries/backoff: <values>
- Pagination: <defaults/maxima>
- Tests added: <summary>
- correlationId logs end-to-end: yes/no

## Quick Test Plan
(commands)

## Rollback
(how to disable quickly)
```

**Defense template** (justify with numbers):
```
# Defense Statement
## Objective
## Design Choices (patterns, alternatives rejected)
## Performance (volumes, big-O, rate-limits, memory bounds)
## Correctness & Compatibility (OpenAPI, Zod)
## Test Strategy (unit, golden, contract, load)
## Security (secrets, redaction)
## Operational Plan (metrics, logs, rollout/rollback)
```

---

## 4) Task Master Integration

**Canonical sequence:**
```
task-master init
task-master add-task --from-file __docs__/plans/taskmaster-plan.txt
task-master validate-dependencies
task-master analyze-complexity --research
task-master complexity-report
task-master expand --all
task-master next
```

**Model config (`.taskmaster/config.json`):**
```json
{ "main": "gpt-5", "research": "claude-code/sonnet", "fallback": "gemini-2.5-pro" }
```

---

## 5) Adapters & Branch Rules (Sonnet MUST follow)

- **Socrata**: map Query→`$select/$where/$order/$limit/$offset`; header `X-App-Token`; Zod-validate rows; backoff on 429.
- **CKAN**: use `datastore_search`; `X-CKAN-API-Key` if needed; Zod-validate; map `filters/sort/limit/offset`.
- **ArcGIS**: FeatureServer `.../query?where&outFields&orderByFields&resultRecordCount&resultOffset&f=json`; OAuth token if needed.

**Branch fuse():**
- Normalize address/geo; compute reconciliation keys.
- Deduplicate; compute `freshness` (recency decay) and `trust_score` (source weights).
- Stamp `provenance`.

**DB schema (reference):**
- `core.items(id, branch_id, title, address, status, sources[], provenance, freshness, trust_score, updated_at)`
- `core.item_embeddings(id, model, embedding VECTOR(D), created_at)` + `ivfflat` index

---

## 6) Checklists Claude must run before proposing “done”

- `pnpm typecheck`
- `pnpm test`
- `npx @redocly/cli lint openapi.yaml`
- If DB touched: output migration SQL and idempotent run command.
- If jobs touched: output command to run a single branch ingest dry-run.

---

## 7) Do/Don’t

**Do**
- Ask for MODE if missing (OPUS or SONNET).
- Quote file paths. Keep diffs minimal.
- Provide measurable defaults for timeouts/backoff.

**Don’t**
- Invent files/domains/dataset IDs.
- Output code in OPUS mode.
- Leave TODOs or `any`.

---

## 8) Quick Prompts (ready to paste)

### OPUS (Plan) — generate/adjust tasks
```
MODE: OPUS (PLAN)
Context: We are building pilot branch `sf.housing.permits`, Socrata-first, then CKAN/ArcGIS, feeding pgvector, exposing /v1/search/hybrid and /v1/reports/permits per openapi.yaml.

Produce:
1) A task list in Task Master format (IDs, titles, deps, labels).
2) Dependency wiring lines (tm add-dependency ...).
No code. Keep tasks ≤ 1 day, atomic, and map each to a file or CLI command.
```

### SONNET (Implement) — implement specific tasks
```
MODE: SONNET (IMPLEMENT)
Implement ONLY these tasks: <ID list>. Targets: <file list>. No other files.

Output:
1) Unified diffs for exactly those files.
2) New files list.
3) Verification commands:
   pnpm typecheck && pnpm test
   npx @redocly/cli lint openapi.yaml

Constraints:
- Zod validate adapter outputs.
- No any. No TODO/FIXME.
- I/O with timeout+retry+backoff, bounded pagination.
- Include provenance, freshness, trust fields in normalized items.
```
