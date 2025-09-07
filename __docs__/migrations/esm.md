# ESM Migration Guide

## Overview

This document describes the migration of the CiviCue project from CommonJS to ECMAScript Modules (ESM) with TypeScript NodeNext module resolution.

## Changes Made

### 1. TypeScript Configuration Split

**tsconfig.json** (typecheck-only):
- `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` for ESM compatibility
- `"noEmit": true"` to prevent accidental compilation from root config
- `"esModuleInterop": false` for stricter ESM compliance
- `"resolveJsonModule": true` for JSON imports

**tsconfig.build.json** (build output):
- Extends root tsconfig.json
- `"noEmit": false"` with `"outDir": "dist"`
- Enables declarations and source maps
- Excludes test files from build output

### 2. Package Configuration

**package.json**:
- Added `"type": "module"` for ESM mode
- Updated scripts:
  - `"build": "tsc -p tsconfig.build.json"`
  - `"typecheck": "tsc -p tsconfig.json --noEmit"`
- Replaced ts-node with tsx in all execution scripts
- Added tsx as dev dependency

### 3. Import Path Updates

All relative imports now include `.js` extensions as required by NodeNext:
- `from './env'` → `from './env.js'`
- `from './lib/hash'` → `from './lib/hash.js'`

**Files updated**:
- `src/lib/config.ts`
- `src/server/bootstrap.ts`
- `services/ingest/csvLoader.ts`
- `tests/env.spec.ts`

### 4. ESM Compatibility

**services/ingest/csvLoader.ts**:
- Replaced `require.main === module` with ESM equivalent:
  ```typescript
  if (import.meta.url === `file://${process.argv[1]}`) {
    main();
  }
  ```

### 5. Vitest Configuration

**vitest.config.ts**:
- Created ESM-compatible config with `export default defineConfig()`
- Node environment with clean mock settings

## Verification

The migration maintains full compatibility:

```bash
npm run typecheck  # Uses split typecheck config
npm run build      # Builds ESM to dist/
npm run test       # Runs tests with ESM
```

## Benefits

1. **Modern Standards**: ESM is the standard module system for modern JavaScript
2. **Better Tree Shaking**: Improved bundle optimization potential  
3. **Strict Imports**: NodeNext requires explicit file extensions, preventing import ambiguity
4. **Split Configs**: Separate typecheck and build configs for cleaner development workflow

## Breaking Changes

- All relative imports must use `.js` extensions
- Scripts now use tsx instead of ts-node
- Build output explicitly configured in tsconfig.build.json