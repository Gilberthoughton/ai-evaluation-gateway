import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerErrorHandler } from './problem.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import type { AppDeps } from './types.js';

export type { AppDeps, ReadinessCheck, Services } from './types.js';

/**
 * Builds (but does not start) the Fastify application: Zod validation/serialization, security
 * headers, CORS, OpenAPI docs, correlation-id propagation, the RFC 7807 error handler, auth/RBAC,
 * and the API routes (versioned under /api/v1).
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // pino's Logger is structurally compatible with Fastify's runtime logger; the cast aligns the
    // static type so plugins (typed against FastifyBaseLogger) compose cleanly.
    loggerInstance: deps.logger as unknown as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Evaluation Gateway',
        version: '0.1.0',
        description: 'Backend for evaluating model outputs: prompts, async evaluation, reviewer scoring.',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Echo the correlation id on every response so clients can quote it.
  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-correlation-id', request.id);
    done(null, payload);
  });

  registerErrorHandler(app);

  await app.register(authPlugin, { verify: deps.verifyAccessToken });

  // Ops endpoints at the root; the versioned API under /api/v1.
  await app.register(healthRoutes, { deps });
  await app.register(
    async (api) => {
      await api.register(authRoutes, { deps });
      await api.register(userRoutes, { deps });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
