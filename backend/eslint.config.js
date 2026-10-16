export default [{
  files: ['**/*.js'],
  ignores: ['node_modules/**', 'coverage/**'],
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'module',
    globals: Object.fromEntries(['process', 'console', 'Buffer', 'URL', 'AbortController', 'setTimeout', 'clearTimeout'].map(name => [name, 'readonly']))
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error',
    'eqeqeq': 'error', 'no-constant-condition': 'error'
  }
}];
