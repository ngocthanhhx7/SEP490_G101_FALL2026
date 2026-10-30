export default {
  projects: ['unit', 'integration'].map(name => ({
    displayName: name, testEnvironment: 'node', transform: {},
    roots: [`<rootDir>/tests/${name}`],
    testMatch: [`**/tests/${name}/**/*.test.js`],
    setupFilesAfterEnv: [`<rootDir>/tests/${name}/setup.js`],
    clearMocks: true
  }))
};
