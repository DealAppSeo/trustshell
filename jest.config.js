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
    // The app's own `@/` alias (tsconfig.json paths), so a test can render a real page.
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    // TSX is app code: JSX on, transpile-only (see tests/tsx-transform.cjs for why it is a
    // separate module). First match wins, so this entry must stay above the SDK one. Lets
    // tests/home-check.test.ts render the home page itself instead of grepping its source.
    '^.+\\.tsx$': '<rootDir>/tests/tsx-transform.cjs',
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.sdk.json' }],
  },
  passWithNoTests: true,
};
