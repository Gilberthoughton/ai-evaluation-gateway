# ADR 0008 — Structured logging (pino) + RFC 7807 error model

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

A backend that runs an async pipeline across an API and worker processes needs logs that can be
correlated across a request and its downstream jobs, and an error contract that clients can rely on.
Free-text logs and ad-hoc error shapes make debugging and client integration painful.

## Decision

**Structured logging:** **pino** (Fastify's logger) emitting one JSON object per line. Every request is
assigned a **correlation id** (from an inbound `x-correlation-id` header or generated) that is attached
to the request logger and **propagated into BullMQ job data**, so a submission's API log line and its
worker log lines share one id. Logs never include secrets, tokens, or full model-output bodies (size +
privacy); payloads are referenced by id.

**Error model:** a typed domain/application error hierarchy (`ValidationError`, `NotFoundError`,
`ForbiddenError`, `ConflictError`, `RateLimitedError`, …) mapped by a single Fastify error handler to
**RFC 7807 `application/problem+json`** responses:

```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "detail": "Reviewer may only score assigned evaluations",
  "correlationId": "..."
}
```

Unexpected errors return a generic 500 problem (no internals leaked) while the full error + stack is
logged with the correlation id.

## Consequences

**Positive**

- One correlation id ties an HTTP request to its automated-check and assignment jobs end to end.
- Clients get a single, predictable error shape with machine-readable `status`/`title` and a
  `correlationId` to quote in support requests.
- JSON logs are ready for ingestion (Loki/ELK/Datadog) without parsing.

**Negative / trade-offs**

- Discipline required to map every thrown error to a typed error (enforced by the central handler +
  tests).
- JSON logs are less human-readable locally (mitigated with `pino-pretty` in development).

## Alternatives considered

- **winston (rejected):** capable, but pino is faster, is Fastify's native logger, and integrates with
  the request lifecycle out of the box.
- **Ad-hoc `{ error: "message" }` responses (rejected):** no standard, drifts per endpoint; RFC 7807 is
  a recognized contract.
