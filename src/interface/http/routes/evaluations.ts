import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { EvaluationEventRecord, EvaluationRecord } from '../../../application/evaluations/ports.js';
import { EVALUATION_STATUSES } from '../../../domain/evaluation/stateMachine.js';
import type { AppDeps } from '../types.js';
import { idParamSchema } from '../schemas.js';

const statusEnum = z.enum(EVALUATION_STATUSES);

const evaluationApi = z.object({
  id: z.string().uuid(),
  submissionId: z.string().uuid(),
  rubricVersionId: z.string().uuid(),
  status: statusEnum,
  assigneeId: z.string().uuid().nullable(),
  automatedResults: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const eventApi = z.object({
  id: z.number(),
  fromStatus: statusEnum.nullable(),
  toStatus: statusEnum,
  reason: z.string().nullable(),
  actorId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime(),
});

const toEvaluationApi = (e: EvaluationRecord) => ({
  ...e,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

const toEventApi = (e: EvaluationEventRecord) => ({ ...e, occurredAt: e.occurredAt.toISOString() });

export const evaluationRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { evaluations } = opts.deps.services;

  r.post(
    '/submissions/:id/evaluations',
    {
      preHandler: [app.authenticate, app.requireRole('SUBMITTER', 'ADMIN')],
      schema: {
        tags: ['evaluations'],
        summary: 'Start an evaluation (enqueues automated checks)',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: z.object({ rubricId: z.string().uuid() }),
        response: { 202: evaluationApi },
      },
    },
    async (request, reply) => {
      const evaluation = await evaluations.startEvaluation({
        submissionId: request.params.id,
        rubricId: request.body.rubricId,
        actorId: request.principal!.id,
        correlationId: request.id,
      });
      reply.status(202);
      return toEvaluationApi(evaluation);
    },
  );

  r.get(
    '/evaluations',
    {
      preHandler: [app.authenticate, app.requireRole('REVIEWER', 'ADMIN')],
      schema: {
        tags: ['evaluations'],
        summary: 'List evaluations (filter by status)',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          status: statusEnum.optional(),
          limit: z.coerce.number().int().positive().max(100).optional(),
          cursor: z.string().optional(),
        }),
        response: {
          200: z.object({ data: z.array(evaluationApi), nextCursor: z.string().nullable() }),
        },
      },
    },
    async (request) => {
      const page = await evaluations.list(request.query);
      return { data: page.data.map(toEvaluationApi), nextCursor: page.nextCursor };
    },
  );

  r.get(
    '/evaluations/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['evaluations'],
        summary: 'Get an evaluation',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: evaluationApi },
      },
    },
    async (request) => toEvaluationApi(await evaluations.getEvaluation(request.params.id)),
  );

  r.get(
    '/evaluations/:id/history',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['evaluations'],
        summary: 'The append-only state-transition history',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: z.array(eventApi) },
      },
    },
    async (request) => (await evaluations.listHistory(request.params.id)).map(toEventApi),
  );

  r.post(
    '/evaluations/:id/cancel',
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['evaluations'],
        summary: 'Cancel an evaluation',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: evaluationApi },
      },
    },
    async (request) =>
      toEvaluationApi(await evaluations.cancel(request.params.id, request.principal!.id, request.id)),
  );
};
