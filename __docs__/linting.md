# ESLint Configuration & Integration

This document describes the ESLint configuration, custom rules, and integration with the development workflow for the CiviCue project.

## Overview and Goals

ESLint is configured to enforce code quality standards across the CiviCue codebase, with specific focus on:

- **Type Safety**: Strict TypeScript rules with no `any` types allowed
- **Import Management**: Proper ES module imports and dependency resolution
- **Security**: Detection of potential security issues and unsafe patterns
- **Code Quality**: Prevention of duplicated code, unused variables, and cognitive complexity
- **CiviCue-Specific Rules**: Custom business logic enforcement (environment variable access, generated file protection)

The configuration supports both JavaScript and TypeScript files in a modern ESM Node.js environment.

## ESLint Configuration

The project uses ESLint's flat config format in `eslint.config.mjs`. Key configuration details:

### Base Configuration
- **Config Format**: ESLint 9.x flat config (`eslint.config.mjs`)
- **Parser**: `@typescript-eslint/parser` for TypeScript files
- **JavaScript Base**: `@eslint/js` recommended rules
- **ECMAScript**: Latest version with ESM modules

### Plugins and Extensions

#### Core Plugins
- `@typescript-eslint/eslint-plugin` - TypeScript-specific rules
- `eslint-plugin-import` - Import/export validation with TypeScript resolver
- `eslint-plugin-n` - Node.js specific rules (configured for ESM)
- `eslint-plugin-promise` - Promise handling best practices
- `eslint-plugin-security` - Security vulnerability detection
- `eslint-plugin-regexp` - Regular expression optimization
- `eslint-plugin-sonarjs` - Code quality and complexity analysis

#### Custom Plugin
- `eslint-plugin-civicue` - CiviCue-specific business rules (see [Custom Rules](#custom-rules))

### File Patterns
- **JavaScript**: `**/*.js`, `**/*.mjs`, `**/*.cjs`
- **TypeScript**: `**/*.ts`, `**/*.tsx`, `**/*.mts`, `**/*.cts`

### Ignored Patterns
```
node_modules/**
dist/**
build/**
coverage/**
.turbo/**
.next/**
src/generated/**
**/*.d.ts
packages/eslint-plugin-civicue/**
```

### Key Rule Categories

#### TypeScript Rules
- `@typescript-eslint/no-explicit-any: error` - No `any` types allowed
- `@typescript-eslint/no-unused-vars: error` - Unused variable detection
- `@typescript-eslint/consistent-type-imports: error` - Consistent import syntax
- `@typescript-eslint/prefer-as-const: error` - Prefer const assertions

#### Import Rules
- `import/no-unresolved: error` - All imports must resolve
- `import/no-self-import: error` - Prevent circular self-imports
- `import/no-useless-path-segments: error` - Clean import paths

#### Promise Rules
- `promise/always-return: error` - Promises must return values
- `promise/catch-or-return: error` - Promises must be handled
- `promise/param-names: error` - Standard parameter naming

#### Security Rules
- `security/detect-object-injection: warn` - Potential prototype pollution
- `security/detect-non-literal-regexp: warn` - Dynamic regex security

#### Code Quality Rules
- `sonarjs/cognitive-complexity: [warn, 15]` - Complexity threshold
- `sonarjs/no-duplicated-branches: error` - Duplicate conditional branches
- `sonarjs/no-identical-functions: error` - Duplicate function implementations

### Custom Rules

The project includes two custom ESLint rules specific to CiviCue:

#### `civicue/no-process-env-outside-env`
- **Purpose**: Centralize environment variable access
- **Rule**: Prohibits direct `process.env` access outside of `src/lib/env.ts`
- **Rationale**: Ensures environment variables are validated and typed in one location

#### `civicue/no-generated-edits`
- **Purpose**: Protect auto-generated files
- **Rule**: Prevents manual edits to files under `src/generated/`
- **Rationale**: Preserves generated OpenAPI types and other auto-generated code

## Commands

The following npm scripts are available for linting:

### Local Development

```bash
# Run ESLint with zero warnings tolerance
npm run lint

# Run ESLint and automatically fix issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Command Details

#### `npm run lint`
- **Command**: `eslint . --max-warnings=0`
- **Behavior**: Scans all files matching configured patterns
- **Exit Codes**: 
  - `0`: No errors or warnings
  - `1`: Errors found (or warnings with `--max-warnings=0`)
- **Example Output**:
```
✖ 3 problems (2 errors, 1 warning)
  2 errors and 0 warnings potentially fixable with the `--fix` option.
```

#### `npm run lint:fix`
- **Command**: `eslint . --fix`
- **Behavior**: Automatically fixes auto-fixable rules
- **Use Case**: Fix formatting, import ordering, and simple rule violations
- **Note**: Some rules require manual intervention (e.g., unused variables, type errors)

### Integration with Other Commands

```bash
# Full quality check pipeline
npm run typecheck && npm run lint && npm run test
```

## Editor Integration

### VS Code Setup

Install the ESLint extension and configure workspace settings:

**Recommended Extensions:**
- `dbaeumer.vscode-eslint` - ESLint integration
- `esbenp.prettier-vscode` - Prettier formatting

**Workspace Settings** (`.vscode/settings.json`):
```json
{
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
  "eslint.format.enable": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### Other Editors
- **WebStorm/IntelliJ**: Built-in ESLint support with automatic detection
- **Vim/Neovim**: Use `ale` or `nvim-lspconfig` with `eslint` language server
- **Emacs**: Use `flycheck-eslint` or `lsp-mode`

## CI Integration

Currently, the project does not have CI/CD pipelines configured, but ESLint can be integrated into various CI systems:

### GitHub Actions Example

```yaml
name: Code Quality

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint
      
      - name: TypeScript type check
        run: npm run typecheck
```

### Key CI Considerations
- **Caching**: Cache `node_modules` to speed up builds
- **Fail Fast**: ESLint runs with `--max-warnings=0` to fail on any issues
- **Parallel Jobs**: Run linting, type checking, and tests in parallel
- **Artifact Storage**: Store lint reports for review in failed builds

## Troubleshooting

### Common Issues and Solutions

#### 1. Parser Errors
**Error**: `Parsing error: Cannot read file './tsconfig.json'`

**Solution**: Ensure TypeScript configuration is present and valid:
```bash
# Verify tsconfig.json exists and is valid
npx tsc --noEmit --listFiles
```

#### 2. Missing Plugins
**Error**: `Definition for rule '@typescript-eslint/no-unused-vars' was not found`

**Solution**: Install missing ESLint plugins:
```bash
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

#### 3. Import Resolution Issues
**Error**: `Unable to resolve path to module './some-module'`

**Cause**: TypeScript path mapping or module resolution configuration

**Solutions**:
- Verify `eslint-import-resolver-typescript` is installed
- Check `tsconfig.json` paths and baseUrl settings
- Ensure import paths use correct file extensions for ESM

#### 4. Prettier Conflicts
**Error**: Conflicting formatting between ESLint and Prettier

**Solution**: The project uses `eslint-config-prettier` to disable conflicting ESLint formatting rules. If conflicts persist:
```bash
# Check for conflicts
npx eslint-config-prettier .eslintrc.js

# Format with Prettier first, then lint
npm run format && npm run lint:fix
```

#### 5. Performance Issues
**Symptoms**: Slow linting in large codebases

**Solutions**:
- Add performance-heavy directories to `.eslintignore`
- Use `--cache` flag for incremental linting
- Consider disabling expensive rules in development:

```bash
# Use cache for faster subsequent runs
npx eslint . --cache --cache-location .eslintcache
```

#### 6. Custom Rule Errors
**Error**: `civicue/no-process-env-outside-env` rule violations

**Solution**: Move environment variable access to `src/lib/env.ts`:
```typescript
// ❌ Don't do this in other files
const dbUrl = process.env.DATABASE_URL;

// ✅ Do this instead
import { env } from '../lib/env.js';
const dbUrl = env.DATABASE_URL;
```

#### 7. TypeScript Project References
**Error**: Issues with monorepo or complex TypeScript setups

**Solution**: Configure ESLint for TypeScript project references:
```javascript
// eslint.config.mjs
export default [
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json']
      }
    }
  }
];
```

### Debug Commands

```bash
# Print ESLint configuration for debugging
npx eslint --print-config file.ts

# Check what files ESLint will process
npx eslint --debug 2>&1 | grep "Processing"

# Validate configuration
npx eslint --validate-config
```

## Configuration Files

- **Main Config**: [`eslint.config.mjs`](../eslint.config.mjs)
- **Custom Plugin**: [`packages/eslint-plugin-civicue/src/index.ts`](../packages/eslint-plugin-civicue/src/index.ts)
- **TypeScript Config**: [`tsconfig.json`](../tsconfig.json) (affects ESLint parser)
- **Package Scripts**: [`package.json`](../package.json) (lint commands)