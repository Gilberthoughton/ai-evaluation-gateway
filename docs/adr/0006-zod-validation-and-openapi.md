# ADR 0006 — Zod as the single validation + OpenAPI source of truth

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

Every request crossing the API boundary must be validated, and the API must be documented accurately.
Maintaining validation logic, TypeScript types, and OpenAPI docs as three separate artifacts guarantees
drift. We want one definition that produces all three.

## Decision

Define every request/response contract as a **Zod** schema, and derive everything from it:

- **Runtime validation:** Fastify validates inbound bodies/params/queries against the Zod schema via a
  Zod type provider; invalid requests are rejected before reaching a handler with a consistent 400
  (RFC 7807, [ADR 0008](0008-logging-and-error-model.md)).
- **Static types:** handler input/output types are **inferred** from the schemas (`z.infer`) — no
  hand-written DTOs that can fall out of sync.
- **OpenAPI:** schemas are converted to OpenAPI 3 components and served via `@fastify/swagger` + Swagger
  UI at `/docs`, so the published contract is generated from the schemas that actually validate traffic.

A shared config schema (also Zod) validates environment variables at startup, failing fast on
misconfiguration (12-factor).

## Consequences

**Positive**

- One definition → validation, types, and docs cannot diverge.
- Validation lives at the edge; the application/domain layers receive already-trusted, typed inputs.
- Generated OpenAPI is always truthful, which matters for a recruiter-facing, API-first project.

**Negative / trade-offs**

- Zod-to-OpenAPI coverage has occasional edges (complex unions) needing manual annotations.
- Schemas add up-front structure versus inline ad-hoc checks (a worthwhile trade).

## Alternatives considered

- **TypeBox / JSON Schema (rejected):** native to Fastify and OpenAPI-friendly, but a less ergonomic
  authoring/inference experience than Zod, which is also reusable outside the HTTP layer.
- **class-validator + decorators (rejected):** ties validation to classes and a decorator runtime,
  conflicting with the plain, functional domain ([ADR 0004](0004-layered-architecture.md)).
- **Hand-written OpenAPI YAML (rejected):** a second source of truth that drifts from the code.
