import type { AppConfig } from '../../src/config/config.js';

/** A complete, valid config for tests that don't depend on real infrastructure. */
export const testConfig: AppConfig = Object.freeze({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  HOST: '127.0.0.1',
  PORT: 0,
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 1_209_600,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: '1 minute',
});
