import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppDeps } from '../types.js';

const checkResult = z.object({ name: z.string(), ok: z.boolean() });

/** Liveness (`/health`) and readiness (`/ready`) probes for orchestration. */
export const healthRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/health',
    {
      schema: {
        tags: ['ops'],
        summary: 'Liveness probe',
        response: { 200: z.object({ status: z.literal('ok'), uptime: z.number() }) },
      },
    },
    () => ({ status: 'ok' as const, uptime: process.uptime() }),
  );

  r.get(
    '/ready',
    {
      schema: {
        tags: ['ops'],
        summary: 'Readiness probe (dependencies reachable)',
        response: {
          200: z.object({ status: z.literal('ready'), checks: z.array(checkResult) }),
          503: z.object({ status: z.literal('unavailable'), checks: z.array(checkResult) }),
        },
      },
    },
    async (_request, reply) => {
      const checks = await Promise.all(
        (opts.deps.readinessChecks ?? []).map(async (probe) => {
          try {
            await probe.check();
            return { name: probe.name, ok: true };
          } catch {
            return { name: probe.name, ok: false };
          }
        }),
      );

      if (!checks.every((c) => c.ok)) {
        reply.status(503);
        return { status: 'unavailable' as const, checks };
      }
      return { status: 'ready' as const, checks };
    },
  );
};
