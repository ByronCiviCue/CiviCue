# Vitest Workspace Configuration

This project uses Vitest workspaces to organize tests into four distinct categories with appropriate timeouts and isolation:

## Projects

- **unit** (`tests/unit/**/*.ts`) - Fast pure functions, 3s timeout, threads pool
- **contracts** (`tests/contracts/**/*.ts`) - Adapter validation against zod schemas, 5s timeout, threads pool  
- **integration** (`tests/integration/**/*.ts`) - End-to-end with pgvector, 15s timeout, forks pool
- **arch** (`tests/arch/**/*.ts`) - Architectural rules (ESLint), 6s timeout, threads pool

## Usage

```bash
pnpm test:unit        # Run unit tests only
pnpm test:contracts   # Run contract tests only  
pnpm test:integration # Run integration tests only
pnpm test:arch        # Run architectural tests only
pnpm test             # Run all projects in sequence
```

## Migration Note

Projects are defined in `vitest.workspace.ts` and are invoked via package scripts.
`vitest.config.ts` remains temporarily for compatibility and will be folded into the `unit` project later.

### Deprecation resolved (Vitest workspace)
Vitest now uses `testProjects` in `vitest.config.ts`. The old `vitest.workspace.ts` has been removed.
Run per-project suites with:
- `pnpm test:unit`
- `pnpm test:contracts`
- `pnpm test:integration`
- `pnpm test:arch`
Existing root tests remain runnable via temporary include patterns and will be relocated in the next commit.