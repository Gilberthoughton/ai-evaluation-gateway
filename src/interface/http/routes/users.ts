import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { UserRecord } from '../../../application/auth/ports.js';
import type { AppDeps } from '../types.js';
import { roleSchema, userPublicSchema } from '../schemas.js';

function toPublic(user: UserRecord) {
  return { id: user.id, email: user.email, role: user.role, status: user.status };
}

export const userRoutes: FastifyPluginAsync<{ deps: AppDeps }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { users } = opts.deps.services;

  r.post(
    '/users',
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['users'],
        summary: 'Create a user (admin only)',
        security: [{ bearerAuth: [] }],
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          role: roleSchema,
        }),
        response: { 201: userPublicSchema },
      },
    },
    async (request, reply) => {
      const created = await users.createUser(request.body);
      reply.status(201);
      return toPublic(created);
    },
  );

  r.get(
    '/users',
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['users'],
        summary: 'List users (admin only)',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(userPublicSchema) },
      },
    },
    async () => (await users.list()).map(toPublic),
  );
};
