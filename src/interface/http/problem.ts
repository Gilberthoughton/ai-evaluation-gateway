import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { isAppError } from '../../domain/errors.js';

/** RFC 7807 problem document. */
interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail: string;
  correlationId: string;
  errors?: unknown;
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

function problem(status: number, detail: string, correlationId: string, errors?: unknown): ProblemDocument {
  return {
    type: 'about:blank',
    title: TITLES[status] ?? 'Error',
    status,
    detail,
    correlationId,
    ...(errors !== undefined ? { errors } : {}),
  };
}

/**
 * Central error handler: maps Zod validation failures, typed {@link AppError}s, Fastify's built-in
 * errors (incl. rate-limit 429), and anything unexpected to a consistent `application/problem+json`
 * response. Internal details are logged with the correlation id but never leaked to the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.id;

    if (hasZodFastifySchemaValidationErrors(error)) {
      reply
        .status(400)
        .type('application/problem+json')
        .send(problem(400, 'Request validation failed', correlationId, error.validation));
      return;
    }

    if (isAppError(error)) {
      if (error.status >= 500) {
        request.log.error({ err: error }, 'application error');
      }
      reply
        .status(error.status)
        .type('application/problem+json')
        .send(problem(error.status, error.message, correlationId, error.details));
      return;
    }

    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      reply
        .status(500)
        .type('application/problem+json')
        .send(problem(500, 'An unexpected error occurred', correlationId));
      return;
    }

    reply
      .status(status)
      .type('application/problem+json')
      .send(problem(status, error.message, correlationId));
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .type('application/problem+json')
      .send(problem(404, `Route ${request.method} ${request.url} not found`, request.id));
  });
}
