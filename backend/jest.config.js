export default {
  projects: ['unit', 'integration'].map(name => ({
    displayName: name, testEnvironment: 'node', transform: {},
    roots: [`<rootDir>/tests/${name}`],
    testMatch: [`**/tests/${name}/**/*.test.js`],
    testTimeout: name === 'integration' ? 180000 : 10000,
    clearMocks: true
  }))
};
