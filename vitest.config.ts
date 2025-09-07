import { defineConfig } from 'vitest/config'

// Deterministic Vitest config with explicit projects.
// - unit: general tests (default globs)
// - contracts: reserved for pact/contract tests
// - integration: reserved for integration tests  
// - arch: architectural/lint guard tests
// NOTE: tsconfigPaths plugin not included - add vite-tsconfig-paths dependency if path aliases needed
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            // everything except explicit arch tests
            'tests/**/*.spec.ts',
            'tests/**/*.test.ts',
            '!tests/eslint-*.test.ts',
            '!tests/**/*arch*.test.ts'
          ],
          environment: 'node',
          globals: true
        }
      },
      {
        test: {
          name: 'contracts',
          include: [
            'tests/contracts/**/*.spec.ts',
            'tests/contracts/**/*.test.ts'
          ],
          environment: 'node',
          globals: true
        }
      },
      {
        test: {
          name: 'integration',
          include: [
            'tests/integration/**/*.spec.ts',
            'tests/integration/**/*.test.ts'
          ],
          environment: 'node',
          globals: true
        }
      },
      {
        test: {
          name: 'arch',
          include: [
            'tests/eslint-*.test.ts',
            'tests/**/*arch*.test.ts'
          ],
          environment: 'node',
          globals: true
        }
      }
    ]
  }
})