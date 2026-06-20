import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { CriterionInput, RubricRecord } from '../../../application/rubrics/ports.js';
import type { AppDeps } from '../types.js';
import { idParamSchema } from '../schemas.js';

const criterionBody = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().positive(),
  scaleMin: z.number().int().default(0),
  scaleMax: z.number().int().default(5),
});

const criterionApi = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  weight: z.number(),
  scaleMin: z.number().int(),
  scaleMax: z.number().int(),
});

const versionApi = z.object({
  id: z.string().uuid(),
  rubricId: z.string().uuid(),
  version: z.number().int(),
  publishedAt: z.string().datetime(),
  criteria: z.array(criterionApi),
});

const rubricApi = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  versions: z.array(versionApi),
});

type CriterionBody = z.infer<typeof criterionBody>;
const toCriterionInput = (c: CriterionBody): CriterionInput => ({
  key: c.key,
  label: c.label,
  description: c.description ?? null,
  weight: c.weight,
  scaleMin: c.scaleMin,
  scaleMax: c.scaleMax,
});

const toRubricApi = (r: RubricRecord) => ({
  id: r.id,
  name: r.name,
  createdAt: r.createdAt.toISOString(),
  versions: r.versions.map((v) => ({ ...v, publishedAt: v.publishedAt.toISOString() })),
});

export const rubricRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { rubrics } = opts.deps.services;

  r.post(
    '/rubrics',
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['rubrics'],
        summary: 'Create a rubric (version 1) with weighted criteria',
        security: [{ bearerAuth: [] }],
        body: z.object({ name: z.string().min(1), criteria: z.array(criterionBody).min(1) }),
        response: { 201: rubricApi },
      },
    },
    async (request, reply) => {
      const created = await rubrics.createRubric({
        name: request.body.name,
        criteria: request.body.criteria.map(toCriterionInput),
      });
      reply.status(201);
      return toRubricApi(created);
    },
  );

  r.post(
    '/rubrics/:id/versions',
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['rubrics'],
        summary: 'Publish a new immutable rubric version',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: z.object({ criteria: z.array(criterionBody).min(1) }),
        response: { 201: versionApi },
      },
    },
    async (request, reply) => {
      const version = await rubrics.publishVersion(
        request.params.id,
        request.body.criteria.map(toCriterionInput),
      );
      reply.status(201);
      return { ...version, publishedAt: version.publishedAt.toISOString() };
    },
  );

  r.get(
    '/rubrics',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['rubrics'],
        summary: 'List rubrics',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(rubricApi) },
      },
    },
    async () => (await rubrics.list()).map(toRubricApi),
  );

  r.get(
    '/rubrics/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['rubrics'],
        summary: 'Get a rubric with all versions',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: rubricApi },
      },
    },
    async (request) => toRubricApi(await rubrics.getRubric(request.params.id)),
  );
};
