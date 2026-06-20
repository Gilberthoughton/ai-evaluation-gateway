import { defineConfig } from 'vitest/config';

/** Unit tests — pure/fast, no external services or Docker. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/server.ts', 'src/worker.ts', 'src/infrastructure/db/migrate.ts'],
    },
  },
});
