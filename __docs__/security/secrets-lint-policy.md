# Secrets Lint Policy

## Purpose

This ESLint configuration enforces server-only secrets access through a controlled facade to prevent accidental client-side secret exposure. All environment variable access must go through the centralized secrets facade rather than direct `process.env` access or importing the raw environment loader.

## Rules Summary

### Forbidden in Application Code
- **Direct `process.env` access** - Blocked with error: "Access env via the secrets facade (@/lib/secrets), not process.env."
- **Direct imports of `src/lib/env`** - All import forms blocked: alias, relative, with/without `.js` specifiers

### Required Pattern
- **Use `@/lib/secrets` facade** for all secret access in application code

## Allowlist Globs

### Full Access (Both Rules Off)
Files that can use `process.env` directly and import the env loader:

- `src/lib/env.ts` - The environment schema and loader
- `src/lib/secrets/**` - The secrets facade implementation 
- `src/server/bootstrap.ts` - Server bootstrap file
- `scripts/**` - Build and utility scripts
- `**/*.config.{js,ts,mjs}` - Configuration files (webpack, vite, etc.)
- `vitest*.{js,ts,mjs}` - Vitest configuration files
- `.husky/**` - Git hooks
- `tests/setup/**` - Test setup and bootstrap files

### Partial Access (Process.env Only)
Files that can read `process.env` but cannot import the env loader directly:

- `tests/**` - Regular test files
- `**/__tests__/**` - Jest-style test directories
- `packages/**/tests/**` - Package test directories

These files can access environment variables for testing but should use the secrets facade for structured secret access.

## NodeNext Import Note

When using NodeNext module resolution, use explicit `.js` specifiers in TypeScript imports:

```javascript
// Correct for NodeNext/ESM
import { secrets } from '@/lib/secrets.js';

// Also acceptable 
import { secrets } from '@/lib/secrets';
```

Never use `.ts` specifiers in imports - they are not valid in ESM.

## How to Fix Violations

### Replace Direct Environment Access

```javascript
// ❌ Wrong - Direct process.env access
const databaseUrl = process.env.DATABASE_URL;
const openaiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || 3000;

// ✅ Correct - Use secrets facade
import { secrets } from '@/lib/secrets.js';

const databaseUrl = secrets.getDatabaseUrl();
const openaiKey = secrets.getOpenAIKey();  
const port = secrets.getPort();
```

### Replace Direct Env Loader Imports

```javascript
// ❌ Wrong - Direct env loader import (all forms)
import { getEnv } from '@/lib/env.js';
import { getEnv } from '@/lib/env';
import { getEnv } from '../lib/env';
import { getEnv } from '../lib/env.js';

const env = getEnv();
const dbUrl = env.db.url;

// ✅ Correct - Use secrets facade
import { secrets } from '@/lib/secrets.js';

const dbUrl = secrets.getDatabaseUrl();
const apiKey = secrets.getOpenAIKey();
```

### Test Files

```javascript
// ✅ Acceptable in test files - direct process.env for test setup
if (process.env.CI) {
  // CI-specific test configuration
}

// ✅ Preferred in test files - use facade for application secrets
import { secrets } from '@/lib/secrets.js';
const testDbUrl = secrets.getDatabaseUrl();
```

## No eslint-disable Policy

**Do not use `// eslint-disable` to bypass these rules in application code.**

- Infrastructure files already have appropriate overrides configured
- If you believe you have a legitimate exception, seek architectural review
- The allowlist is comprehensive for valid use cases

Common invalid approaches:
```javascript
// ❌ Wrong - Do not disable the rule
// eslint-disable-next-line no-restricted-properties
const secret = process.env.API_KEY;

// ❌ Wrong - Do not disable import restrictions  
// eslint-disable-next-line no-restricted-imports
import { getEnv } from '@/lib/env.js';
```

## Enforcement Behavior

The ESLint rules are configured in flat config with careful override ordering:

1. **Global forbids** apply to all TypeScript and JavaScript files
2. **Specific allowlists** override the global rules for legitimate use cases
3. **Last-match-wins** semantics ensure proper rule application

### Error Messages

**For direct process.env access:**
```
Access env via the secrets facade (@/lib/secrets), not process.env.
```

**For direct env imports:**
```
'@/lib/env' import is restricted from being used.
```

## Integration

These rules are automatically enforced by:
- `pnpm lint` - Full codebase linting
- `pnpm lint:changed` - Staged file linting (pre-commit)
- CI verification via `pnpm -s lint`

## References

- [Secrets Facade Documentation](__docs__/security/secrets-facade.md)
- [Secrets Policy](SECRETS.md)
- [Environment Configuration](src/lib/env.ts)
- [Secrets Facade Implementation](src/lib/secrets/)