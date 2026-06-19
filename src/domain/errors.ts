/**
 * Typed application errors. Each maps to an HTTP status and a stable machine-readable code; the HTTP
 * layer renders them as RFC 7807 problem documents (ADR 0008). Throwing these from the domain and
 * application layers keeps error semantics out of the transport layer.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION';
}

export class UnauthenticatedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED';
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}

export class UnprocessableError extends AppError {
  readonly status = 422;
  readonly code = 'UNPROCESSABLE';
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
