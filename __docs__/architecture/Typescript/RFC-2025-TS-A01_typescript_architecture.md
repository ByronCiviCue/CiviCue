# The Unified TypeScript Architecture & Style Guide

**ID:** RFC-2025-TS-A01  
**Version:** 3.1.0  
**Status:** RATIFIED

## Threat Model Summary

**Threats:** 
- Unsafe runtime data coercion
- Untyped external system boundaries
- Third-party dependency type drift
- Inconsistent developer patterns
- Insecure third-party type definitions (supply chain attacks)

**Mitigations:** 
- Mandatory Zod validation at trust boundaries
- Automated/versioned extraction of third-party type contracts
- Mandatory compiler, linter, and pre-commit hook enforcement
- Quarantine and review protocol for type contract changes

**Residual Risks:** 
- Intentional bypass of enforcement mechanisms
- Inadequate test coverage for complex type guards
- These are managed via code review, protected branch rules, and coverage metrics

---

## Table of Contents

1. [Core Philosophy: The Single Source of Truth](#1-core-philosophy-the-single-source-of-truth)
2. [The Golden Rule: Eradicate `any` and `unknown` Abuse](#2-the-golden-rule-eradicate-any-and-unknown-abuse)
3. [Core Architectural Patterns](#3-core-architectural-patterns)
4. [Validation Strategy: TypeScript vs. Zod](#4-validation-strategy-typescript-vs-zod)
5. [Managing Third-Party Type Contracts](#5-managing-third-party-type-contracts)
6. [Governance: Mandatory Enforcement & Implementation](#6-governance-mandatory-enforcement--implementation)
7. [Security Protocol: Third-Party Type Supply Chain](#7-security-protocol-third-party-type-supply-chain)
8. [Testing, Metrics, and Observability](#8-testing-metrics-and-observability)

---

## 1. Core Philosophy: The Single Source of Truth

Every piece of data in our TypeScript application must have **exactly one authoritative type definition**. This type serves as the contract between components, the blueprint for transformations, and the foundation for all compile-time guarantees.

### 1.1. Data Flow and Type Evolution

```mermaid
graph LR
    A[External API] -->|Raw JSON| B[Zod Schema]
    B -->|Validated| C[Core Type]
    C -->|Transform| D[Domain Type]
    D -->|Props| E[UI Component]
```

**Key Principle:** Types flow from external boundaries inward, becoming progressively more refined and domain-specific. Each transformation is explicit and type-safe.

### 1.2. Type Ownership

- **API Types:** Owned by the team managing the API contract
- **Domain Types:** Owned by the business logic layer
- **Component Types:** Owned by the UI team
- **Shared Types:** Must have a designated owner and change review process

---

## 2. The Golden Rule: Eradicate `any` and `unknown` Abuse

The use of `any` is **forbidden** in production code. The use of `unknown` is restricted to specific, well-defined scenarios.

### 2.1. Enforcement

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

```javascript
// .eslintrc.js
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/ban-types": [
      "error",
      {
        "types": {
          "Function": "Use specific function type signatures",
          "{}": "Use Record<string, unknown> instead"
        }
      }
    ]
  }
}
```

### 2.2. Acceptable Use of `unknown`

`unknown` is only acceptable when:
1. Data genuinely has no knowable shape (rare)
2. You immediately narrow it with a type guard
3. It's branded for traceability

```typescript
// Branded unknown for traceability
type CmsDataOpaque = unknown & { readonly __brand: 'cms-data' };

// Must be immediately narrowed
function processCmsData(data: CmsDataOpaque): ProcessedData {
  if (!isCmsData(data)) {
    throw new Error('Invalid CMS data');
  }
  return transformCmsData(data);
}
```

---

## 3. Core Architectural Patterns

### 3.1. Type System Hierarchy: Core-Trunk-Branch-Leaf

```
app/
├── types/
│   ├── core/          # Foundational types (User, Auth)
│   ├── trunk/         # Domain types (Product, Order)
│   ├── branch/        # Feature types (CheckoutFlow)
│   └── leaf/          # Component-specific types
```

**Rules:**
- **Core** types have zero dependencies
- **Trunk** types depend only on Core
- **Branch** types depend on Core and Trunk
- **Leaf** types may depend on any layer
- **Circular dependencies are forbidden**

### 3.2. The CardOS™ Orchestrator Pattern

This pattern enforces strict separation between data logic and presentation.

```typescript
// Orchestrator: Logic only, no JSX
export async function ProductOrchestrator({ productId }: { productId: string }) {
  try {
    const rawData = await fetchProduct(productId);
    const validated = ProductSchema.parse(rawData);
    const displayProps = transformToDisplayProps(validated);
    
    return {
      stage: 'rendering' as const,
      displayProps
    };
  } catch (error) {
    return {
      stage: 'error' as const,
      reason: error instanceof z.ZodError ? 'validation' : 'network',
      error
    };
  }
}

// Display Component: Presentation only, no logic
export function ProductDisplay({ displayProps }: ProductDisplayProps) {
  return <div>{/* Pure presentation */}</div>;
}
```

**Lifecycle Contract:**

```typescript
type OrchestratorState =
  | { stage: 'idle' }
  | { stage: 'fetching' }
  | { stage: 'validating' }
  | { stage: 'transforming' }
  | { stage: 'rendering'; displayProps: Record<string, unknown> }
  | { stage: 'error'; reason: 'network' | 'validation' | 'unknown'; error: Error };
```

---

## 4. Validation Strategy: TypeScript vs. Zod

### 4.1. The Boundary Rule

```typescript
// External boundary - use Zod
const ExternalDataSchema = z.object({
  id: z.string(),
  amount: z.number()
});

// Internal component - use TypeScript
interface InternalComponentProps {
  id: string;
  amount: number;
}
```

### 4.2. Trust Boundaries Requiring Zod

1. **External APIs** - All HTTP responses
2. **Browser APIs** - localStorage, sessionStorage, IndexedDB
3. **User Input** - Forms, file uploads
4. **External Messages** - WebSocket, postMessage
5. **CMS Content** - Sanity, Contentful, etc.

### 4.3. Exception: CMS-Driven Props

When component props come directly from a CMS:

```typescript
// Page-level validation
export async function Page({ slug }: { slug: string }) {
  const rawCmsData = await fetchFromCms(slug);
  const safeProps = CMSCardSchema.parse(rawCmsData); // Validate at boundary
  
  return <CmsDrivenCard {...safeProps} />; // Type-safe props
}
```

---

## 5. Managing Third-Party Type Contracts

### 5.1. The Extraction Mandate

All third-party types must be extracted and versioned locally. Direct imports from `node_modules` are forbidden for types we depend on.

### 5.2. Type Extraction Map

```json
// type-extraction-map.json
{
  "@heroui/react": ["ListboxProps", "SelectProps"],
  "some-charting-library": ["ChartConfig", "DataPoint"]
}
```

### 5.3. Extraction Script Requirements

1. Must use `ts-morph` for AST manipulation
2. Must fail on `any` type detection
3. Must generate `third-party-contracts.d.ts`
4. Must be run in CI to detect drift

---

## 6. Governance: Mandatory Enforcement & Implementation

### 6.1. Compiler and Linter Enforcement

**Required `tsconfig.json` settings:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### 6.2. Type Contract Extraction and Verification

- Type extraction script must exist in `scripts/extract-types.ts`
- Generated contracts must be in `app/types/generated/third-party-contracts.d.ts`
- CI must verify contracts haven't drifted

### 6.3. Pre-Commit Enforcement

```yaml
# .husky/pre-commit
#!/bin/sh
npx lint-staged
npm run type-check
```

**Emergency Bypass Protocol:**
- Requires explicit approval
- Must be documented in PR
- Triggers mandatory post-mortem

### 6.4. Architectural Rule Engine Integration

The `digest` framework must be extended with:
- Banned import path rules
- File structure validation
- Pattern detection (e.g., Orchestrators with JSX)

---

## 7. Security Protocol: Third-Party Type Supply Chain

### 7.1. The CI Security Gate

```yaml
type-drift-check:
  steps:
    - run: npm ci
    - run: npm run types:extract
    - run: git diff --exit-code -- app/types/generated/
```

### 7.2. Quarantine & Review Protocol

When type drift is detected:

1. **Tag:** Add `[SECURITY-REVIEW-REQUIRED]` label
2. **Analyze:** Post diff summary in PR
3. **Review:** Security lead must approve changes

**Red Flags:**
- Types changing to `any` or `unknown`
- New execution-related properties
- Overly permissive types

### 7.3. Rollback Procedure

1. Revert the PR that introduced the change
2. Create security incident ticket
3. Pin dependency to safe version

---

## 8. Testing, Metrics, and Observability

### 8.1. Testing Framework: Vitest

**Justification:**
- Native TypeScript/ESM support
- Unified configuration with Vite
- Superior performance via HMR
- Jest-compatible API

### 8.2. Global Test Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: './tests/setup/global.ts',
    setupFiles: ['./tests/setup/msw.ts']
  }
});
```

### 8.3. API Mocking: Mock Service Worker (MSW)

All HTTP interactions must be mocked using MSW for resilience to implementation changes.

### 8.4. Contract Testing

```typescript
// tests/contracts/openapi.test.ts
describe('API Contract Validation', () => {
  it('GET /pets/:petId :: MUST conform to schema', async () => {
    const res = await api.get('/pets/1');
    expect(res.data).toSatisfySchemaInApi();
  });
});
```

### 8.5. Code Shape Validation

**Mandatory:** Orchestrator outputs must be validated with inline snapshots:

```typescript
it('MUST produce stable data contract', async () => {
  const result = await getProductDisplayProps('123');
  
  expect(result).toMatchInlineSnapshot(`
    {
      "displayProps": {
        "formattedPrice": "$199.99",
        "isAvailable": true,
        "title": "Golden Widget"
      },
      "stage": "rendering"
    }
  `);
});
```

### 8.6. Advanced Drift Analysis

AST-based semantic diff to catch:
- Type widening to `any`
- Required → optional property changes
- Structural type changes

### 8.7. Metrics and Monitoring

**CI Metrics Collection:**
```bash
eslint --format json --output-file eslint-report.json
npm run digest -- --output-format json
```

**Alerting:** 10% increase in violations triggers team notification

---

## Conclusion

This RFC establishes TypeScript as more than a language choice - it's an architectural philosophy. The enforcement mechanisms transform these principles from documentation into active, self-enforcing contracts.

**Implementation Priority:**
1. Enforcement systems (Sections 6-8)
2. Type extraction tooling
3. Metrics pipeline
4. Team training

Success is measured not by initial compliance, but by sustained architectural health over time.