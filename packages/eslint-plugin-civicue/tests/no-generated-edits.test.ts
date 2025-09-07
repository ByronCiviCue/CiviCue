import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../src/rules/no-generated-edits.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

ruleTester.run('no-generated-edits', rule, {
  valid: [
    // Valid: Files outside src/generated/**
    {
      code: 'export const config = { port: 3000 };',
      filename: 'src/config.ts',
    },
    {
      code: 'function helper() { return "test"; }',
      filename: 'src/utils/helper.ts',
    },
    {
      code: 'const data = [1, 2, 3];',
      filename: 'src/lib/data.ts',
    },
    {
      code: `
        interface User {
          id: string;
          name: string;
        }
        export { User };
      `,
      filename: 'src/types/user.ts',
    },
  ],

  invalid: [
    // Invalid: Files under src/generated/**
    {
      code: 'export const generatedConfig = {};',
      filename: 'src/generated/config.ts',
      errors: [
        {
          messageId: 'generatedFileEdit',
          line: 1,
          column: 1,
        },
      ],
    },
    {
      code: 'interface GeneratedType { id: string; }',
      filename: 'src/generated/types/api.ts',
      errors: [
        {
          messageId: 'generatedFileEdit',
          line: 1,
          column: 1,
        },
      ],
    },
    {
      code: `
        // This is auto-generated code
        export const schema = {
          version: "1.0.0"
        };
      `,
      filename: 'src/generated/schema/main.ts',
      errors: [
        {
          messageId: 'generatedFileEdit',
          line: 1,
          column: 1,
        },
      ],
    },
    // Test Windows path separators
    {
      code: 'const generated = true;',
      filename: 'src\\generated\\windows\\path.ts',
      errors: [
        {
          messageId: 'generatedFileEdit',
          line: 1,
          column: 1,
        },
      ],
    },
  ],
});