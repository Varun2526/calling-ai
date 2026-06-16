import { defineConfig } from 'vitest/config';

// Unit tests for pure domain/application logic only (no Nest runtime, no DB). Integration
// and cross-tenant tests that need Postgres live under test/ and run against docker-compose.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
