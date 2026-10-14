module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  clearMocks: true,
};
