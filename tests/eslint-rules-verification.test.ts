import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import civicuePlugin from '../packages/eslint-plugin-civicue/dist/index.js';

describe('ESLint Custom Rules CI Verification', () => {
  it('should report errors for process.env outside env.ts', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        plugins: {
          civicue: civicuePlugin,
        },
        rules: {
          'civicue/no-process-env-outside-env': 'error',
        },
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
    });
    
    const violatingCode = 'const apiKey = process.env.API_KEY;';
    const results = await eslint.lintText(violatingCode, { 
      filePath: 'src/services/test.ts' 
    });

    expect(results).toHaveLength(1);
    expect(results[0].errorCount).toBeGreaterThan(0);
    
    const hasProcessEnvError = results[0].messages.some(
      msg => msg.ruleId === 'civicue/no-process-env-outside-env'
    );
    expect(hasProcessEnvError).toBe(true);
  });

  it('should report errors for files under src/generated/', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        plugins: {
          civicue: civicuePlugin,
        },
        rules: {
          'civicue/no-generated-edits': 'error',
        },
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
    });
    
    const generatedFileCode = 'export const generatedConfig = {};';
    const results = await eslint.lintText(generatedFileCode, { 
      filePath: 'src/generated/config.ts' 
    });

    expect(results).toHaveLength(1);
    expect(results[0].errorCount).toBeGreaterThan(0);
    
    const hasGeneratedEditError = results[0].messages.some(
      msg => msg.ruleId === 'civicue/no-generated-edits'
    );
    expect(hasGeneratedEditError).toBe(true);
  });

  it('should allow process.env in src/lib/env.ts', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        plugins: {
          civicue: civicuePlugin,
        },
        rules: {
          'civicue/no-process-env-outside-env': 'error',
        },
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
    });
    
    const envFileCode = 'const apiKey = process.env.API_KEY;';
    const results = await eslint.lintText(envFileCode, { 
      filePath: 'src/lib/env.ts' 
    });

    expect(results).toHaveLength(1);
    
    const hasProcessEnvError = results[0].messages.some(
      msg => msg.ruleId === 'civicue/no-process-env-outside-env'
    );
    expect(hasProcessEnvError).toBe(false);
  });

  it('should validate that ESLint config includes custom rules', async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile('src/lib/env.ts'); // Use a real file that exists in tsconfig
    
    expect(config.rules).toHaveProperty('civicue/no-process-env-outside-env');
    expect(config.rules).toHaveProperty('civicue/no-generated-edits');
    expect(config.rules['civicue/no-process-env-outside-env']).toEqual([2]); // ESLint stores as array
    expect(config.rules['civicue/no-generated-edits']).toEqual([2]); // ESLint stores as array
  });
});