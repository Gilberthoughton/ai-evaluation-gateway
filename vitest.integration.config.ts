import { defineConfig } from 'vitest/config';

/**
 * Integration tests — exercise real PostgreSQL + Redis via Testcontainers. A single global setup
 * starts the containers and runs migrations once; tests connect via injected URLs. Files run
 * serially (one fork) so they share the containers without cross-test interference on the pool.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
