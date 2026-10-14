export default [{
  files: ['**/*.{js,jsx}'],
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: Object.fromEntries([
      'window', 'document', 'fetch', 'Headers', 'AbortController', 'DOMException',
      'setTimeout', 'clearTimeout', 'URL', 'console', 'test', 'expect', 'jest',
      'describe', 'afterEach', 'beforeEach',
    ].map((name) => [name, 'readonly'])),
  },
  rules: {
    'no-undef': 'error', 'no-unreachable': 'error',
    'no-constant-condition': 'error', 'no-debugger': 'error',
    'no-duplicate-imports': 'error', 'no-var': 'error',
    'eqeqeq': ['error', 'always'],
  },
}];
