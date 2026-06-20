import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppDeps } from '../types.js';
import { roleSchema, tokensSchema } from '../schemas.js';

export const authRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { auth } = opts.deps.services;

  r.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange credentials for access + refresh tokens',
        body: z.object({ email: z.string().email(), password: z.string().min(1) }),
        response: { 200: tokensSchema },
      },
    },
    (request) => auth.login(request.body.email, request.body.password),
  );

  r.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotate a refresh token for a new token pair',
        body: z.object({ refreshToken: z.string().min(1) }),
        response: { 200: tokensSchema },
      },
    },
    (request) => auth.refresh(request.body.refreshToken),
  );

  r.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke a refresh token',
        body: z.object({ refreshToken: z.string().min(1) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await auth.logout(request.body.refreshToken);
      reply.status(204);
      return null;
    },
  );

  r.get(
    '/auth/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'The authenticated principal',
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ id: z.string().uuid(), role: roleSchema }) },
      },
    },
    (request) => {
      const principal = request.principal!;
      return { id: principal.id, role: principal.role };
    },
  );
};
