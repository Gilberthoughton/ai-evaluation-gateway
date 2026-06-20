import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIntegrationApp, seedUserAndLogin, type IntegrationApp } from './helpers/app.js';

const criteria = [
  { key: 'correctness', label: 'Correctness', weight: 3, scaleMin: 0, scaleMax: 5 },
  { key: 'readability', label: 'Readability', weight: 1, scaleMin: 0, scaleMax: 5 },
];

describe('rubrics (HTTP)', () => {
  let ctx: IntegrationApp;
  let admin: string;
  let reviewer: string;

  beforeAll(async () => {
    ctx = await buildIntegrationApp();
    admin = await seedUserAndLogin(ctx, 'ADMIN');
    reviewer = await seedUserAndLogin(ctx, 'REVIEWER');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  async function createRubric(): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rubrics',
      headers: auth(admin),
      payload: { name: 'Code quality', criteria },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().versions[0]).toMatchObject({ version: 1 });
    expect(res.json().versions[0].criteria).toHaveLength(2);
    return res.json().id as string;
  }

  it('admin creates a rubric (version 1) with criteria', async () => {
    const id = await createRubric();
    const got = await ctx.app.inject({ method: 'GET', url: `/api/v1/rubrics/${id}`, headers: auth(admin) });
    expect(got.statusCode).toBe(200);
    expect(got.json().versions[0].criteria[0]).toMatchObject({ key: 'correctness', weight: 3 });
  });

  it('forbids a reviewer from creating rubrics (RBAC)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rubrics',
      headers: auth(reviewer),
      payload: { name: 'x', criteria },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects duplicate criterion keys (domain validation → 400)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rubrics',
      headers: auth(admin),
      payload: {
        name: 'dupe',
        criteria: [
          { key: 'a', label: 'A', weight: 1, scaleMin: 0, scaleMax: 5 },
          { key: 'a', label: 'A2', weight: 1, scaleMin: 0, scaleMax: 5 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('publishes a new immutable version', async () => {
    const id = await createRubric();
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/rubrics/${id}/versions`,
      headers: auth(admin),
      payload: {
        criteria: [{ key: 'efficiency', label: 'Efficiency', weight: 2, scaleMin: 0, scaleMax: 10 }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ version: 2 });

    const got = await ctx.app.inject({ method: 'GET', url: `/api/v1/rubrics/${id}`, headers: auth(admin) });
    expect(got.json().versions).toHaveLength(2);
  });
});
