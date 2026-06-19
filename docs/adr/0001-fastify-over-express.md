# ADR 0001 — Fastify as the HTTP framework (over Express)

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

The gateway is an API-first, TypeScript backend with strict request/response contracts, generated
OpenAPI docs, and meaningful throughput on the submission and analysis endpoints. The HTTP framework
choice influences validation ergonomics, type-safety, performance, and how cleanly the web layer
stays a thin adapter over the application core.

## Decision

Use **Fastify**. It provides:

- **Schema-first routing** that integrates cleanly with Zod via a type provider, so a route's
  validated input/output types are inferred end to end (see [ADR 0006](0006-zod-validation-and-openapi.md)).
- **First-class TypeScript** support and a typed plugin/decorator system for cross-cutting concerns
  (auth, rate limiting, logging) without leaking into handlers.
- **Built-in structured logging** (pino) and a fast JSON serializer.
- **Strong performance** under load relative to Express, which matters for the analysis endpoints.
- A mature plugin ecosystem we will use directly: `@fastify/jwt`, `@fastify/rate-limit`,
  `@fastify/swagger`, `@fastify/helmet`.

## Consequences

**Positive**

- The web layer stays a thin, well-typed adapter; validation and serialization are declarative.
- OpenAPI is generated from the same schemas that validate requests — docs cannot drift from behavior.
- Built-in pino logging aligns with [ADR 0008](0008-logging-and-error-model.md).

**Negative / trade-offs**

- Smaller community and fewer tutorials than Express; some middleware must be adapted to Fastify plugins.
- The plugin encapsulation model has a learning curve compared with Express middleware.

## Alternatives considered

- **Express (rejected):** the most familiar option, but weaker TypeScript story, no built-in schema
  validation or structured logging, and lower throughput — more glue code to reach the same place.
- **NestJS (rejected):** batteries-included and enterprise-friendly, but its decorator/DI framework is
  heavyweight for a focused service and would obscure the clean-architecture boundaries this project
  is meant to demonstrate explicitly ([ADR 0004](0004-layered-architecture.md)).
- **Hono / raw Node (rejected):** great for edge/minimal use, but less of the production middleware we
  want (mature JWT, rate-limit, OpenAPI plugins) out of the box.
