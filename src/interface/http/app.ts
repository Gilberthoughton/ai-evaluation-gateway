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
import type { AppConfig } from '../../config/config.js';
import type { Logger } from '../../infrastructure/observability/logger.js';
import { registerErrorHandler } from './problem.js';
import { healthRoutes } from './routes/health.js';

/** A named readiness probe; a throw means "not ready". */
export interface ReadinessCheck {
  name: string;
  check(): Promise<void>;
}

/** Everything the HTTP layer needs, injected at the composition root (ADR 0004). */
export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  readinessChecks?: ReadinessCheck[];
}

/**
 * Builds (but does not start) the Fastify application: Zod validation/serialization, security
 * headers, CORS, OpenAPI docs, correlation-id propagation, the RFC 7807 error handler, and routes.
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

  await app.register(healthRoutes, { deps });

  return app;
}
