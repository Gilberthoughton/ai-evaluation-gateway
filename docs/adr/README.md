# Architecture Decision Records

The significant, hard-to-reverse decisions behind the AI Evaluation Gateway. Each record states
the **context**, the **decision**, its **consequences**, and the **alternatives rejected and why**.
ADRs are immutable once accepted; a decision is changed by superseding it with a new record.

## Index

| ADR                                        | Decision                                                    | Status   |
| ------------------------------------------ | ----------------------------------------------------------- | -------- |
| [0001](0001-fastify-over-express.md)       | Fastify as the HTTP framework (over Express)                | Accepted |
| [0002](0002-drizzle-orm.md)                | Drizzle ORM + drizzle-kit for PostgreSQL (over Prisma)      | Accepted |
| [0003](0003-bullmq-evaluation-pipeline.md) | BullMQ on Redis for the async evaluation pipeline           | Accepted |
| [0004](0004-layered-architecture.md)       | Layered (clean) architecture with an inward dependency rule | Accepted |
| [0005](0005-authentication-and-rbac.md)    | JWT access/refresh auth + role-based access control         | Accepted |
| [0006](0006-zod-validation-and-openapi.md) | Zod as the single validation + OpenAPI source of truth      | Accepted |
| [0007](0007-rate-limiting.md)              | Redis-backed distributed rate limiting                      | Accepted |
| [0008](0008-logging-and-error-model.md)    | Structured logging (pino) + RFC 7807 error model            | Accepted |
| [0009](0009-audit-log-and-immutability.md) | Append-only audit log + immutable evaluation history        | Accepted |

## Format

Lightweight [MADR](https://adr.github.io/madr/)-style: _Context → Decision → Consequences →
Alternatives considered_.
