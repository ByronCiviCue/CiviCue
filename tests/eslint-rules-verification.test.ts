import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const cwd = process.cwd();

async function lintVirtual(text: string, virtualPath: string, withTs = false) {
  const base: any = {
    cwd,
    overrideConfigFile: 'eslint.config.mjs',
    ignore: false
  };
  if (withTs) {
    base.overrideConfig = [{
      files: ['**/*.ts'],
      languageOptions: {
        // ESLint v9 flat-config shape
        parser: await import('@typescript-eslint/parser').then(m => m.default ?? m),
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          project: false
        }
      }
    }];
  }
  const eslint = new ESLint(base);
  const opts: Parameters<ESLint['lintText']>[1] = {  filePath: join(cwd, virtualPath)  };
  const [res] = await eslint.lintText(text, opts);
  return res;
}

describe('civicue ESLint architectural rules', () => {
  it('flags direct process.env access outside env loader', async () => {
    const res = await lintVirtual(
      'const x = process.env.SECRET_TOKEN as unknown; console.log(x);',
      'src/app/fake-env-violation.ts',
      true // Enable TypeScript parser for .ts file
    );
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.messages.some(m => m.ruleId === 'civicue/no-process-env-outside-env')).toBe(true);
  });

  it('flags any file path under src/generated/**', async () => {
    const res = await lintVirtual(
      'export const _: number = 1;',
      'src/generated/fake.ts',
      true // enable TS parser via flat override
    );
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.messages.some(m => m.ruleId === 'civicue/no-generated-edits')).toBe(true);
  });
});
