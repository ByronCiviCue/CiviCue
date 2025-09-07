# Environment Variable Workflow

This document describes the standardized environment variable workflow for CiviCue, implementing a no-duplication policy with clear separation between example, local, and CI configurations.

## File Structure

- **`.env.example`** (tracked): Single source of truth for variable names, comments, and safe placeholders
- **`.env.local`** (gitignored): Developer-only overrides and secrets for local development
- **`.env.ci`** (tracked): CI-specific overrides or mappings only; no secrets
- **`.env`**: Not used - removed from the workflow

## Deterministic Loading Order

### Local Development
1. Load `.env.example` as defaults
2. Overlay `.env.local` (overrides defaults)
3. Never rely on plain `.env` file

### CI/Production
1. Prefer injection from CI secret store via environment variables
2. Optionally load `.env.ci` with `override=false` (won't overwrite injected secrets)
3. Never require `.env.local` in CI

## Generation vs Injection Policy

### Preferred: Runtime Injection
- **CI/Production**: Do not generate env files; inject via runtime environment variables from secret stores (GitHub Actions secrets, Vault, etc.)
- Environment variables are injected directly into the process environment
- `.env.ci` (if used) loads with `override=false` to preserve injected values

### Allowed Exception: Ephemeral File Generation
- If a tool mandates a dotenv file in CI, generate an ephemeral file (e.g., `.env.runtime`) at job runtime
- Use injected secrets to populate the ephemeral file
- Use it for the specific step that requires it
- Delete it before job completion
- Ensure it's gitignored and never uploaded as an artifact

### Local Development: Convenience Generation
- Use `pnpm env:local:init` to scaffold `.env.local` from `.env.example`
- Script is idempotent (no overwrite without `--force`)
- Never runs in CI (guarded by `CI` environment variable)

## Commands

### Initialize Local Environment
```bash
# Create .env.local from .env.example (safe defaults, empty secrets)
pnpm env:local:init

# Force regenerate .env.local (overwrites existing)
pnpm env:local:init --force
```

### Validate Environment Setup
```bash
# Check git hygiene, file structure, and variable completeness
pnpm env:validate
```

## Migration from Existing Setup

If you have an existing `.env` file:

1. **Backup your secrets**: Copy any actual secrets from `.env` to a safe location
2. **Remove tracked `.env`**: The file should not be in git
3. **Initialize `.env.local`**: Run `pnpm env:local:init`
4. **Populate secrets**: Fill in your actual secrets in `.env.local`
5. **Verify**: Run `pnpm env:validate` to ensure proper setup

## Guardrails and Validation

The `env:validate` script checks:

- **Git hygiene**: No tracked `.env`, `.env.local`, or `.env.runtime` files
- **File structure**: Required files exist with proper gitignore status
- **Secret scanning**: No secrets leaked in tracked files
- **Variable completeness**: All required variables exist in `.env.example`
- **Duplicate detection**: Warns about redundant definitions in `.env.ci`

## Decision Tree: Injection vs Generation

```
Need environment variables?
├── Local Development
│   ├── Use .env.example for defaults
│   ├── Use .env.local for secrets (run: pnpm env:local:init)
│   └── Load both files at runtime
├── CI/Production (Preferred)
│   ├── Inject via environment variables from secret store
│   ├── Optionally use .env.ci for non-secret mappings
│   └── Never generate files
└── CI/Production (Exception - Tool requires dotenv file)
    ├── Generate ephemeral .env.runtime from injected secrets
    ├── Use for specific step only
    ├── Delete before job completion
    └── Ensure gitignored and not uploaded as artifact
```

## Examples

### Local Development Startup
```typescript
// src/config/env.ts handles loading automatically
import { initEnv } from './src/config/env';

// This loads .env.example then .env.local
initEnv();

// Now use process.env.DATABASE_URL, etc.
```

### CI with Runtime Injection (Preferred)
```yaml
# GitHub Actions example
jobs:
  build:
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - name: Run tests
        run: pnpm test  # Uses injected environment variables
```

### CI with Ephemeral File (Exception)
```yaml
# Only if a tool absolutely requires a .env file
jobs:
  special-tool:
    steps:
      - name: Generate ephemeral env file
        run: |
          echo "DATABASE_URL=${{ secrets.DATABASE_URL }}" > .env.runtime
          echo "API_KEY=${{ secrets.API_KEY }}" >> .env.runtime
      
      - name: Run tool that requires .env file
        run: some-tool --env-file .env.runtime
      
      - name: Cleanup ephemeral file
        run: rm -f .env.runtime
        if: always()
```

## Security Considerations

- **Never commit secrets**: Use the validation script to check for leaks
- **Redact logs**: Sensitive values are automatically redacted in logs
- **Ephemeral files**: Must be cleaned up and never persisted
- **CI artifacts**: Never upload env files as build artifacts