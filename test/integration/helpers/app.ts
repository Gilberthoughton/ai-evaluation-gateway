import { inject } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { compose, type Composition } from '../../../src/composition.js';
import type { AppConfig } from '../../../src/config/config.js';
import type { Role } from '../../../src/domain/roles.js';
import { createLogger } from '../../../src/infrastructure/observability/logger.js';
import { buildApp } from '../../../src/interface/http/app.js';
import { testConfig } from '../../helpers/testConfig.js';

export interface IntegrationApp {
  app: FastifyInstance;
  composition: Composition;
  close(): Promise<void>;
}

/** Builds a fully wired app against the Testcontainers Postgres/Redis provided by global setup. */
export async function buildIntegrationApp(): Promise<IntegrationApp> {
  const config: AppConfig = {
    ...testConfig,
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
  };
  const composition = compose(config, createLogger(config));
  const app = await buildApp(composition.deps);
  await app.ready();
  return {
    app,
    composition,
    close: async () => {
      await app.close();
      await composition.close();
    },
  };
}

/** Seeds a user with the given role and returns a valid access token for it. */
export async function seedUserAndLogin(ctx: IntegrationApp, role: Role): Promise<string> {
  const email = `${role.toLowerCase()}-${crypto.randomUUID()}@example.com`;
  const password = 'password123';
  await ctx.composition.deps.services.users.createUser({ email, password, role });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  return res.json().accessToken as string;
}
