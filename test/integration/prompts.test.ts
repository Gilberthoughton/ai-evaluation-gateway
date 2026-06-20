import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIntegrationApp, seedUserAndLogin, type IntegrationApp } from './helpers/app.js';

describe('prompts + submissions (HTTP)', () => {
  let ctx: IntegrationApp;
  let submitter: string;
  let reviewer: string;

  beforeAll(async () => {
    ctx = await buildIntegrationApp();
    submitter = await seedUserAndLogin(ctx, 'SUBMITTER');
    reviewer = await seedUserAndLogin(ctx, 'REVIEWER');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function createPrompt(token: string): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      headers: auth(token),
      payload: {
        title: 'Reverse a string',
        content: 'Write reverse(s)',
        language: 'python',
        tags: ['strings'],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('lets a submitter create a prompt and read it back', async () => {
    const id = await createPrompt(submitter);
    const got = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/prompts/${id}`,
      headers: auth(submitter),
    });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ id, language: 'python', tags: ['strings'] });
  });

  it('forbids a reviewer from creating prompts (RBAC)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      headers: auth(reviewer),
      payload: { title: 't', content: 'c', language: 'python' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('validates the request body (Zod → 400 problem)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      headers: auth(submitter),
      payload: { title: '', content: 'c', language: 'python' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 404 for an unknown prompt', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/prompts/${crypto.randomUUID()}`,
      headers: auth(submitter),
    });
    expect(res.statusCode).toBe(404);
  });

  it('lists prompts with a cursor field', async () => {
    await createPrompt(submitter);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/prompts?limit=1',
      headers: auth(submitter),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body).toHaveProperty('nextCursor');
  });

  it('adds and lists submissions for a prompt', async () => {
    const promptId = await createPrompt(submitter);
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/prompts/${promptId}/submissions`,
      headers: auth(submitter),
      payload: { modelName: 'gpt-x', modelVersion: '2026-06', output: 'def reverse(s): return s[::-1]' },
    });
    expect(created.statusCode).toBe(201);
    const submissionId = created.json().id as string;

    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/prompts/${promptId}/submissions`,
      headers: auth(submitter),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((s: { id: string }) => s.id)).toContain(submissionId);

    const one = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}`,
      headers: auth(submitter),
    });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ modelName: 'gpt-x', promptId });
  });
});
