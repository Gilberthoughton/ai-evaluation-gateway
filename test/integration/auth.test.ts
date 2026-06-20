import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildIntegrationApp, type IntegrationApp } from './helpers/app.js';

describe('auth + RBAC (HTTP)', () => {
  let ctx: IntegrationApp;
  const adminEmail = `admin-${crypto.randomUUID()}@example.com`;
  const adminPassword = 'password123';

  beforeAll(async () => {
    ctx = await buildIntegrationApp();
    await ctx.composition.deps.services.users.createUser({
      email: adminEmail,
      password: adminPassword,
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const login = (email: string, password: string): Promise<LightMyRequestResponse> =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  it('logs in and returns the principal via /auth/me', async () => {
    const res = await login(adminEmail, adminPassword);
    expect(res.statusCode).toBe(200);
    const { accessToken } = res.json();

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe('ADMIN');
  });

  it('rejects bad credentials with a 401 problem document', async () => {
    const res = await login(adminEmail, 'wrong-password');
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('requires authentication for protected routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('admin can create a user; a reviewer is forbidden from admin routes', async () => {
    const { accessToken: adminToken } = (await login(adminEmail, adminPassword)).json();
    const reviewerEmail = `reviewer-${crypto.randomUUID()}@example.com`;

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: reviewerEmail, password: 'password123', role: 'REVIEWER' },
    });
    expect(created.statusCode).toBe(201);

    const { accessToken: reviewerToken } = (await login(reviewerEmail, 'password123')).json();
    const forbidden = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${reviewerToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rotates refresh tokens and rejects reuse of a rotated token', async () => {
    const { refreshToken } = (await login(adminEmail, adminPassword)).json();

    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);

    const reused = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(reused.statusCode).toBe(401);
  });
});
