module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
  moduleNameMapper: { '\\.(css)$': '<rootDir>/tests/styleMock.cjs' },
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  clearMocks: true,
};
