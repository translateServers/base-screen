import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Package suites already run through Turbo; the root suite owns only cross-package and example tests.
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
