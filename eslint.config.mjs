// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import nPlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import securityPlugin from 'eslint-plugin-security';
import regexpPlugin from 'eslint-plugin-regexp';
import civicuePlugin from './packages/eslint-plugin-civicue/dist/index.js';

/**
 * ESLint flat config for Node.js, TypeScript, and ESM
 * All dependencies installed in Task 55
 */
export default [
  // Base JavaScript recommended rules
  js.configs.recommended,
  
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      '.next/**',
      'src/generated/**',
      '**/*.d.ts'
    ]
  },
  
  // Main configuration for all JS/TS files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    
    plugins: {
      import: importPlugin,
      n: nPlugin,
      promise: promisePlugin,
      security: securityPlugin,
      regexp: regexpPlugin,
      civicue: civicuePlugin
    },
    
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        // Web APIs available in Node.js
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    },

    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json'
        }
      }
    },
    
    rules: {
      // Core ESLint rules for code quality
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': 'error',
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
      'no-empty': 'warn',
      
      // ESM specific rules
      'no-global-assign': 'error',
      'no-implicit-globals': 'error',

      // Import plugin rules
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/default': 'error',
      'import/no-absolute-path': 'error',
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
      
      // Node.js plugin rules
      'n/no-missing-import': 'off', // TypeScript resolver handles this
      'n/no-missing-require': 'off', // TypeScript resolver handles this
      'n/no-unsupported-features/es-syntax': 'off', // We use modern ES features
      
      // Promise plugin rules
      'promise/always-return': 'error',
      'promise/catch-or-return': 'error',
      'promise/param-names': 'error',
      'promise/no-return-wrap': 'error',
      
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      
      // RegExp rules
      'regexp/no-unused-capturing-group': 'error',
      'regexp/no-useless-flag': 'error',
      
      // CiviCue custom rules
      'civicue/no-process-env-outside-env': 'error',
      'civicue/no-generated-edits': 'error'
    }
  },
  
  // TypeScript-specific configuration
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    
    plugins: {
      '@typescript-eslint': tsPlugin,
      sonarjs: sonarjsPlugin
    },
    
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    
    rules: {
      // TypeScript handles these better than ESLint
      'no-unused-vars': 'off',
      'no-undef': 'off',

      // TypeScript ESLint recommended rules
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      
      // SonarJS rules for code quality
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/prefer-single-boolean-return': 'error'
    }
  },

  // Config files override
  {
    files: ['**/*.config.ts', 'vitest.config.ts', 'eslint.config.mjs'],
    languageOptions: {
      parserOptions: {
        project: null
      }
    },
    rules: {
      'civicue/no-process-env-outside-env': 'off'
    }
  },

  // Packages override
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: null
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',  // ESLint API uses any types
      'sonarjs/no-duplicate-string': 'off'
    }
  },

  // Test files override
  {
    files: ['tests/**/*.ts', '**/__tests__/**/*.ts', 'packages/**/tests/**/*.ts'],
    rules: {
      'civicue/no-process-env-outside-env': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'sonarjs/no-duplicate-string': 'off'
    }
  },

  // Environment validation files only
  {
    files: ['src/lib/env.ts'],
    rules: {
      'security/detect-object-injection': 'off'  // Needed for environment validation
    }
  },

  // Scripts configuration (more lenient)
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',  // Console usage is expected in scripts
      'civicue/no-process-env-outside-env': 'off',
      'security/detect-object-injection': 'off',
      'no-empty': 'off'
    }
  }
];