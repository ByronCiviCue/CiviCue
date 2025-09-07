import { ESLint } from 'eslint';
import plugin from '../src/index.js';
import { describe, it, expect } from 'vitest';

describe('ESLint Plugin Integration', () => {
  it('should load plugin and report violations', async () => {
    const eslint = new ESLint({
      baseConfig: {
        plugins: {
          civicue: plugin,
        },
        rules: {
          'civicue/no-process-env-outside-env': 'error',
          'civicue/no-generated-edits': 'error',
        },
      },
      useEslintrc: false,
    });

    // Test no-process-env-outside-env rule
    const processEnvResults = await eslint.lintText(
      'const apiKey = process.env.API_KEY;',
      { filePath: 'src/services/api.ts' }
    );

    expect(processEnvResults).toHaveLength(1);
    expect(processEnvResults[0].errorCount).toBe(1);
    expect(processEnvResults[0].messages[0].ruleId).toBe('civicue/no-process-env-outside-env');

    // Test no-generated-edits rule  
    const generatedFileResults = await eslint.lintText(
      'export const config = {};',
      { filePath: 'src/generated/config.ts' }
    );

    expect(generatedFileResults).toHaveLength(1);
    expect(generatedFileResults[0].errorCount).toBe(1);
    expect(generatedFileResults[0].messages[0].ruleId).toBe('civicue/no-generated-edits');
  });

  it('should not report violations for valid cases', async () => {
    const eslint = new ESLint({
      baseConfig: {
        plugins: {
          civicue: plugin,
        },
        rules: {
          'civicue/no-process-env-outside-env': 'error',
          'civicue/no-generated-edits': 'error',
        },
      },
      useEslintrc: false,
    });

    // Valid: process.env in env.ts
    const envFileResults = await eslint.lintText(
      'const apiKey = process.env.API_KEY;',
      { filePath: 'src/lib/env.ts' }
    );

    expect(envFileResults).toHaveLength(1);
    expect(envFileResults[0].errorCount).toBe(0);

    // Valid: regular file outside generated
    const regularFileResults = await eslint.lintText(
      'export const config = {};',
      { filePath: 'src/config.ts' }
    );

    expect(regularFileResults).toHaveLength(1);
    expect(regularFileResults[0].errorCount).toBe(0);
  });

  it('should work with recommended config', async () => {
    const eslint = new ESLint({
      baseConfig: plugin.configs.recommended,
      useEslintrc: false,
    });

    const results = await eslint.lintText(
      'const apiKey = process.env.API_KEY;',
      { filePath: 'src/services/api.ts' }
    );

    expect(results).toHaveLength(1);
    expect(results[0].errorCount).toBe(1);
    expect(results[0].messages[0].ruleId).toBe('civicue/no-process-env-outside-env');
  });
});