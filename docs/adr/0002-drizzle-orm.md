# ADR 0002 — Drizzle ORM + drizzle-kit for PostgreSQL (over Prisma)

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

The service stores prompts, model outputs, evaluations, rubric scores, comparisons, and an
append-only audit log in PostgreSQL. We need: type-safe queries, reviewable SQL migrations, an
explicit and thin data layer that can be hidden behind repository ports
([ADR 0004](0004-layered-architecture.md)), and predictable performance for analysis queries
(aggregations, joins).

## Decision

Use **Drizzle ORM** with **drizzle-kit** migrations. Schema is defined in TypeScript; queries are
type-safe and close to SQL; migrations are generated as plain, reviewable SQL files.

## Consequences

**Positive**

- **SQL-explicit and type-safe:** complex analysis queries (aggregates, window functions, joins) are
  expressed directly with full inference — no query-builder abstraction fighting the database.
- **Thin runtime:** a lightweight library, not a separate engine/generated client process — fits a
  clean data-adapter layer and keeps cold start and memory low (good for workers and containers).
- **Reviewable migrations:** drizzle-kit emits SQL migration files that are diffed and code-reviewed.
- **No client leakage:** Drizzle types stay in the infrastructure layer behind repository ports.

**Negative / trade-offs**

- Smaller ecosystem and less tooling/GUI than Prisma; fewer high-level conveniences (we write more SQL).
- Relations and migration workflows are less automated; the team owns more schema detail (acceptable,
  and arguably desirable for an auditable data model).

## Alternatives considered

- **Prisma (rejected, but a close call):** excellent DX, mature migrations and Studio, widely
  recognized. Rejected because its generated client is a heavier runtime dependency that tends to leak
  into application code, its query API abstracts away SQL we want explicit for analysis, and its engine
  adds operational weight. The choice is deliberately isolated behind repository ports, so swapping to
  Prisma later is a localized change.
- **Knex / raw `pg` (rejected):** maximum control but no type-safety; reintroduces the boilerplate and
  drift Drizzle removes.
- **TypeORM (rejected):** decorator/Active-Record style conflicts with the explicit layering and has a
  history of migration sharp edges.
