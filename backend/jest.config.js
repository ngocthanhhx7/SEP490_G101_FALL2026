export default {
  // Keep CI memory bounded when integration suites accumulate ESM contexts.
  // Jest recycles its single child worker after it exceeds this idle threshold.
  workerIdleMemoryLimit: '768MB',
  projects: ['unit', 'integration'].map(name => ({
    displayName: name, testEnvironment: 'node', transform: {},
    roots: [`<rootDir>/tests/${name}`],
    testMatch: [`**/tests/${name}/**/*.test.js`],
    setupFilesAfterEnv: [`<rootDir>/tests/${name}/setup.js`],
    clearMocks: true
  }))
};
