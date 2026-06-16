import { defineConfig } from 'vitest/config';

// Root-level Vitest config so the architecture fitness test (tests/architecture.spec.ts)
// can be run from the repo root with `vitest run`. Per-package tests keep their own configs.
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: false,
  },
});
