/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // The published entry is ESM. Jest's loader rejects `export`, so tests use the
  // package's CommonJS Node build. Node outside Jest still loads the ESM entry.
  moduleNameMapper: {
    '^@hyperdag/proof-verifier$': '<rootDir>/tests/proof-verifier.cjs',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.sdk.json' }],
  },
  passWithNoTests: true,
};
