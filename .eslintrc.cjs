module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, es2022: true },
  plugins: ['import'],
  extends: ['eslint:recommended', 'plugin:import/recommended', 'prettier'],
  rules: {
    'import/order': ['warn', { 'newlines-between': 'always' }],
    'no-console': 'off'
  },
  ignorePatterns: ['dist/', 'node_modules/']
};