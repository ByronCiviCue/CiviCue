import noProcessEnvOutsideEnv from './rules/no-process-env-outside-env.js';
import noGeneratedEdits from './rules/no-generated-edits.js';

export default {
  meta: {
    name: 'eslint-plugin-civicue',
    version: '1.0.0',
  },
  
  rules: {
    'no-process-env-outside-env': noProcessEnvOutsideEnv,
    'no-generated-edits': noGeneratedEdits,
  },
  
  configs: {
    recommended: {
      plugins: {},
      rules: {
        'civicue/no-process-env-outside-env': 'error',
        'civicue/no-generated-edits': 'error',
      },
    },
  },
};