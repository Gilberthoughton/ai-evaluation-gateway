# ADR 0004 — Layered (clean) architecture with an inward dependency rule

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

The service has real domain rules (evaluation state machine, rubric scoring, role permissions) that
must not be entangled with Fastify, Drizzle, Redis, or BullMQ. We want the business logic to be
unit-testable without spinning up a database or broker, and we want infrastructure choices
([ADR 0001](0001-fastify-over-express.md), [ADR 0002](0002-drizzle-orm.md),
[ADR 0003](0003-bullmq-evaluation-pipeline.md)) to be swappable.

## Decision

Organize the codebase in layers with a strict **inward dependency rule** — outer layers depend on
inner layers, never the reverse:

```
interface  (Fastify routes, controllers, Zod schemas, OpenAPI)  ─┐
application(use cases / services, ports: repositories, queue)    │  depends inward
domain     (entities, value objects, state machine, rules)  ◀────┘  (pure, no I/O, no framework)
infrastructure (Drizzle repos, BullMQ, Redis, auth, pino)  implements the application's ports
```

- **domain** — pure TypeScript: `Evaluation` state machine, rubric scoring math, role rules. No imports
  from Fastify/Drizzle/Redis.
- **application** — use cases (e.g. `SubmitModelOutput`, `ScoreEvaluation`, `RunAutomatedChecks`) that
  orchestrate the domain and depend on **ports** (`EvaluationRepository`, `JobQueue`, `Clock`).
- **infrastructure** — adapters implementing the ports (Drizzle repositories, BullMQ queue, argon2,
  pino).
- **interface** — the Fastify HTTP layer and the worker entrypoints, wiring everything via composition.

Dependencies point inward; the domain knows nothing about the outside world.

## Consequences

**Positive**

- Domain rules are unit-tested with plain function calls — no DB/Redis needed for the fast test tier.
- Infrastructure is swappable behind ports (Drizzle→Prisma, BullMQ→pg-boss) without touching use cases.
- The same use cases are invoked from both the HTTP API and the background workers.

**Negative / trade-offs**

- More files and explicit wiring than a route-handler-does-everything style; a deliberate trade for
  testability and clear boundaries.
- Requires discipline (lint rules / import boundaries) to keep the dependency direction honest.

## Alternatives considered

- **Route-handler-centric (rejected):** fastest to start, but business logic ends up coupled to Fastify
  and Drizzle, untestable without infrastructure, and hard to reuse from workers.
- **Full hexagonal/DDD ceremony (rejected):** more abstraction than this service needs; the layered rule
  above captures the value (testable core, swappable edges) without over-engineering.
