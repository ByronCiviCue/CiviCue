import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../src/rules/no-process-env-outside-env.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

ruleTester.run('no-process-env-outside-env', rule, {
  valid: [
    // Valid: Inside env.ts file
    {
      code: 'const dbUrl = process.env.DATABASE_URL;',
      filename: 'src/lib/env.ts',
    },
    {
      code: 'const { PORT, HOST } = process.env;',
      filename: 'src/lib/env.ts',
    },
    {
      code: 'const apiKey = process["env"].API_KEY;',
      filename: 'src/lib/env.ts',
    },
    
    // Valid: Code not using process.env
    {
      code: 'const config = getEnv("DATABASE_URL");',
      filename: 'src/services/database.ts',
    },
    {
      code: 'import { DATABASE_URL } from "./lib/env.js";',
      filename: 'src/services/database.ts',
    },
    {
      code: 'const result = someFunction();',
      filename: 'src/utils/helper.ts',
    },
  ],

  invalid: [
    // Invalid: Direct access in other files
    {
      code: 'const dbUrl = process.env.DATABASE_URL;',
      filename: 'src/services/database.ts',
      errors: [
        {
          messageId: 'processEnvAccess',
          line: 1,
          column: 15,
        },
      ],
    },
    {
      code: 'const apiKey = process["env"].API_KEY;',
      filename: 'src/utils/config.ts',
      errors: [
        {
          messageId: 'processEnvAccess',
          line: 1,
          column: 16,
        },
      ],
    },
    {
      code: 'const { PORT, HOST } = process.env;',
      filename: 'src/server.ts',
      errors: [
        {
          messageId: 'processEnvAccess',
          line: 1,
          column: 24,
        },
      ],
    },
    {
      code: `
        const port = process.env.PORT;
        const host = process["env"].HOST;
      `,
      filename: 'src/app.ts',
      errors: [
        {
          messageId: 'processEnvAccess',
          line: 2,
          column: 22,
        },
        {
          messageId: 'processEnvAccess',
          line: 3,
          column: 22,
        },
      ],
    },
  ],
});