import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Worker } from 'bullmq';
import { createRedisConnection } from '../../src/infrastructure/queue/connection.js';
import {
  EVALUATION_AUTOMATED_QUEUE,
  type AutomatedCheckJob,
} from '../../src/infrastructure/queue/evaluationQueue.js';
import { buildIntegrationApp, seedUserAndLogin, type IntegrationApp } from './helpers/app.js';

describe('evaluations + async pipeline (HTTP + BullMQ)', () => {
  let ctx: IntegrationApp;
  let submitter: string;
  let admin: string;

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ctx = await buildIntegrationApp();
    submitter = await seedUserAndLogin(ctx, 'SUBMITTER');
    admin = await seedUserAndLogin(ctx, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function fixtures(): Promise<{ submissionId: string; rubricId: string }> {
    const prompt = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      headers: auth(submitter),
      payload: { title: 't', content: 'c', language: 'python' },
    });
    const promptId = prompt.json().id as string;
    const submission = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/prompts/${promptId}/submissions`,
      headers: auth(submitter),
      payload: { modelName: 'gpt-x', output: 'def f(): return 1' },
    });
    const rubric = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/rubrics',
      headers: auth(admin),
      payload: { name: 'r', criteria: [{ key: 'k', label: 'K', weight: 1, scaleMin: 0, scaleMax: 5 }] },
    });
    return { submissionId: submission.json().id as string, rubricId: rubric.json().id as string };
  }

  async function startEvaluation(submissionId: string, rubricId: string) {
    return ctx.app.inject({
      method: 'POST',
      url: `/api/v1/submissions/${submissionId}/evaluations`,
      headers: auth(submitter),
      payload: { rubricId },
    });
  }

  it('starts an evaluation (202 PENDING) and records the initial history event', async () => {
    const { submissionId, rubricId } = await fixtures();
    const res = await startEvaluation(submissionId, rubricId);
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('PENDING');
    const id = res.json().id as string;

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/evaluations/${id}/history`,
      headers: auth(admin),
    });
    expect(history.json().map((e: { toStatus: string }) => e.toStatus)).toContain('PENDING');
  });

  it('a worker drains the queue and advances the evaluation to AWAITING_REVIEW', async () => {
    const connection = createRedisConnection(inject('redisUrl'));
    const worker = new Worker<AutomatedCheckJob, void, string>(
      EVALUATION_AUTOMATED_QUEUE,
      (job) =>
        ctx.composition.evaluationService.runAutomatedChecks(job.data.evaluationId, job.data.correlationId),
      { connection },
    );

    try {
      const { submissionId, rubricId } = await fixtures();
      const id = (await startEvaluation(submissionId, rubricId)).json().id as string;

      // poll until the worker has advanced the evaluation
      const deadline = Date.now() + 15_000;
      let status = 'PENDING';
      let body: { status: string; automatedResults?: unknown } = { status };
      while (Date.now() < deadline && status !== 'AWAITING_REVIEW') {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/v1/evaluations/${id}`,
          headers: auth(admin),
        });
        body = res.json();
        status = body.status;
        if (status !== 'AWAITING_REVIEW') await new Promise((r) => setTimeout(r, 150));
      }

      expect(status).toBe('AWAITING_REVIEW');
      expect(body.automatedResults).toMatchObject({ nonEmpty: true });

      const history = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/evaluations/${id}/history`,
        headers: auth(admin),
      });
      expect(history.json().map((e: { toStatus: string }) => e.toStatus)).toEqual([
        'PENDING',
        'RUNNING_CHECKS',
        'AWAITING_REVIEW',
      ]);
    } finally {
      await worker.close();
      connection.disconnect();
    }
  });

  it('admin can cancel a pending evaluation', async () => {
    const { submissionId, rubricId } = await fixtures();
    const id = (await startEvaluation(submissionId, rubricId)).json().id as string;
    const cancelled = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/evaluations/${id}/cancel`,
      headers: auth(admin),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('CANCELLED');
  });

  it('404s when starting an evaluation against a missing rubric', async () => {
    const { submissionId } = await fixtures();
    const res = await startEvaluation(submissionId, crypto.randomUUID());
    expect(res.statusCode).toBe(404);
  });
});
