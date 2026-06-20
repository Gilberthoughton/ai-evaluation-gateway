import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PromptRecord, SubmissionRecord } from '../../../application/prompts/ports.js';
import type { AppDeps } from '../types.js';
import { idParamSchema, pageQuerySchema, promptApiSchema, submissionApiSchema } from '../schemas.js';

const createPromptBody = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.string().min(1),
  difficulty: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const createSubmissionBody = z.object({
  modelName: z.string().min(1),
  modelVersion: z.string().optional(),
  output: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const toPromptApi = (p: PromptRecord) => ({ ...p, createdAt: p.createdAt.toISOString() });
const toSubmissionApi = (s: SubmissionRecord) => ({ ...s, createdAt: s.createdAt.toISOString() });

export const promptRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prompts } = opts.deps.services;

  r.post(
    '/prompts',
    {
      preHandler: [app.authenticate, app.requireRole('SUBMITTER', 'ADMIN')],
      schema: {
        tags: ['prompts'],
        summary: 'Register a coding prompt',
        security: [{ bearerAuth: [] }],
        body: createPromptBody,
        response: { 201: promptApiSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const created = await prompts.createPrompt({
        title: body.title,
        content: body.content,
        language: body.language,
        difficulty: body.difficulty ?? null,
        tags: body.tags ?? [],
        createdBy: request.principal!.id,
      });
      reply.status(201);
      return toPromptApi(created);
    },
  );

  r.get(
    '/prompts',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['prompts'],
        summary: 'List prompts (keyset pagination)',
        security: [{ bearerAuth: [] }],
        querystring: pageQuerySchema,
        response: {
          200: z.object({ data: z.array(promptApiSchema), nextCursor: z.string().nullable() }),
        },
      },
    },
    async (request) => {
      const page = await prompts.listPrompts(request.query);
      return { data: page.data.map(toPromptApi), nextCursor: page.nextCursor };
    },
  );

  r.get(
    '/prompts/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['prompts'],
        summary: 'Get a prompt',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: promptApiSchema },
      },
    },
    async (request) => toPromptApi(await prompts.getPrompt(request.params.id)),
  );

  r.post(
    '/prompts/:id/submissions',
    {
      preHandler: [app.authenticate, app.requireRole('SUBMITTER', 'ADMIN')],
      schema: {
        tags: ['submissions'],
        summary: 'Add a model output for a prompt',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: createSubmissionBody,
        response: { 201: submissionApiSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const created = await prompts.addSubmission({
        promptId: request.params.id,
        modelName: body.modelName,
        modelVersion: body.modelVersion ?? null,
        output: body.output,
        metadata: body.metadata ?? {},
        submittedBy: request.principal!.id,
      });
      reply.status(201);
      return toSubmissionApi(created);
    },
  );

  r.get(
    '/prompts/:id/submissions',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['submissions'],
        summary: "List a prompt's submissions (the comparison set)",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: z.array(submissionApiSchema) },
      },
    },
    async (request) => (await prompts.listSubmissions(request.params.id)).map(toSubmissionApi),
  );

  r.get(
    '/submissions/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['submissions'],
        summary: 'Get a submission',
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { 200: submissionApiSchema },
      },
    },
    async (request) => toSubmissionApi(await prompts.getSubmission(request.params.id)),
  );
};
