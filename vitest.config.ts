import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Package suites already run through Turbo; the root suite owns only cross-package and example tests.
    include: ['tests/**/*.test.ts', 'examples/**/tests/**/*.test.ts'],
  },
});
