import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ForbiddenError, UnauthenticatedError } from '../../../domain/errors.js';
import type { Role } from '../../../domain/roles.js';

export interface Principal {
  id: string;
  role: Role;
}

export interface AuthPluginOptions {
  verify(token: string): { sub: string; role: Role };
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
  interface FastifyInstance {
    /** preHandler that authenticates the bearer token and populates `request.principal`. */
    authenticate: preHandlerHookHandler;
    /** Builds a preHandler enforcing that the principal has one of the given roles. */
    requireRole(...roles: Role[]): preHandlerHookHandler;
  }
}

/**
 * Authentication + RBAC. `authenticate` verifies the bearer access token and attaches the principal;
 * `requireRole(...)` gates a route to specific roles (run after `authenticate`). Resource-level
 * ownership checks live in the application layer (ADR 0005).
 */
export const authPlugin = fp<AuthPluginOptions>((app, opts, done) => {
  app.decorate('authenticate', function (request: FastifyRequest, _reply: FastifyReply, done) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      done(new UnauthenticatedError('Missing bearer token'));
      return;
    }
    try {
      const payload = opts.verify(header.slice('Bearer '.length));
      request.principal = { id: payload.sub, role: payload.role };
      done();
    } catch {
      done(new UnauthenticatedError('Invalid or expired token'));
    }
  });

  app.decorate('requireRole', function (...roles: Role[]): preHandlerHookHandler {
    return function (request: FastifyRequest, _reply: FastifyReply, done) {
      if (!request.principal) {
        done(new UnauthenticatedError('Not authenticated'));
        return;
      }
      if (!roles.includes(request.principal.role)) {
        done(new ForbiddenError('Insufficient role for this operation'));
        return;
      }
      done();
    };
  });

  done();
});
