/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(three|three-stdlib)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.worker.ts',
    '!src/engine/bootstrap.ts',
    '!src/index.ts'
  ],
  moduleNameMapper: {
    '^three$': '<rootDir>/src/test/mocks/three.mock.ts',
    '^three/(.*)$': '<rootDir>/src/test/mocks/three.mock.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true
};