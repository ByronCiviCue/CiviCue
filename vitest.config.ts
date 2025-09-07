import { defineConfig } from 'vitest/config';

// Deduplicated literals to appease sonarjs/no-duplicate-string
const EXCLUDE_COMMON = ['dist/**', 'node_modules/**'];
const EXCLUDE_WIDE = ['dist/**', 'node_modules/**', 'tests/fixtures/**', 'sandbox/**', 'fixtures/**'];
const INCLUDE_UNIT = ['tests/unit/**/*.ts'];
const INCLUDE_CONTRACTS = ['tests/contracts/**/*.ts'];
const INCLUDE_INTEGRATION = ['tests/integration/**/*.ts'];
const INCLUDE_ARCH = ['tests/arch/**/*.ts'];

export default defineConfig({
  test: {
    include: [], // force project selection via --project
    projects: [
      {
        test: {
          name: 'unit',
          include: INCLUDE_UNIT, // TEMP until Commit B moves files
          exclude: EXCLUDE_WIDE,
          environment: 'node',
          pool: 'threads',
          testTimeout: 3000,
          retry: 1,
          coverage: { enabled: true }
        }
      },
      {
        test: {
          name: 'contracts',
          include: INCLUDE_CONTRACTS,
          exclude: EXCLUDE_WIDE,
          environment: 'node',
          pool: 'threads',
          testTimeout: 5000,
          retry: 1,
          coverage: { enabled: true }
        }
      },
      {
        test: {
          name: 'integration',
          include: INCLUDE_INTEGRATION,
          exclude: EXCLUDE_WIDE,
          environment: 'node',
          pool: 'forks',
          testTimeout: 15000,
          retry: 0,
          coverage: { enabled: true }
        }
      },
      {
        test: {
          name: 'arch',
          include: INCLUDE_ARCH, // TEMP until Commit B moves file
          exclude: EXCLUDE_COMMON,
          environment: 'node',
          pool: 'threads',
          testTimeout: 6000,
          retry: 0,
          coverage: { enabled: false }
        }
      }
    ]
  }
});
