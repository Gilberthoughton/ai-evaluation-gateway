import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/interface/http/app.js';
import { createLogger } from '../../src/infrastructure/observability/logger.js';
import { testConfig } from '../helpers/testConfig.js';

describe('health & readiness', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ config: testConfig, logger: createLogger(testConfig) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok with a correlation id', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('echoes an inbound correlation id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'abc-123' },
    });
    expect(res.headers['x-correlation-id']).toBe('abc-123');
  });

  it('GET /ready returns ready when no checks fail', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
  });

  it('unknown routes return an RFC 7807 problem', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, title: 'Not Found' });
  });
});
