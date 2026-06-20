import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { GlobalSetupContext } from 'vitest/node';
import { runMigrations } from '../../src/infrastructure/db/migrate.js';

let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;

export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  postgres = await new PostgreSqlContainer('postgres:16').start();
  redis = await new RedisContainer('redis:7').start();

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = redis.getConnectionUrl();

  await runMigrations(databaseUrl);

  provide('databaseUrl', databaseUrl);
  provide('redisUrl', redisUrl);

  return async () => {
    await postgres.stop();
    await redis.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
