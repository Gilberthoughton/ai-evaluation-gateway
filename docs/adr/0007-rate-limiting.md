# ADR 0007 — Redis-backed distributed rate limiting

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

The API is exposed to scripted submitters and runs as multiple horizontally scaled instances. Without
limits, a misbehaving client or credential-stuffing attempt could exhaust the database, the evaluation
queue, or auth resources. An in-memory per-instance limit is ineffective once there is more than one
instance (each keeps its own count), so limits must be shared across instances.

## Decision

Use **`@fastify/rate-limit` backed by Redis** so counters are shared across all API instances. Limits
are **per identity** (authenticated user / API key, falling back to client IP) and **tiered by route
sensitivity**:

- **Auth endpoints** (`/auth/login`, refresh): strict limits to blunt brute force.
- **Write endpoints** (prompt/submission/score creation): moderate limits protecting Postgres and the
  evaluation queue.
- **Read/analysis endpoints**: looser limits.

Responses include `RateLimit-*` headers and return **429** with an RFC 7807 body and `Retry-After`
([ADR 0008](0008-logging-and-error-model.md)). Redis is already a dependency for the job pipeline
([ADR 0003](0003-bullmq-evaluation-pipeline.md)).

## Consequences

**Positive**

- Correct limiting across a scaled-out deployment; one shared source of truth for counters.
- Tiered limits protect the most abuse-prone surfaces (auth, writes) without throttling analytics reads.
- Standard headers + 429 semantics make client behavior predictable.

**Negative / trade-offs**

- A Redis round-trip per limited request (negligible; Redis is local/fast and already in the stack).
- Redis availability affects limiting; on Redis failure the policy is fail-closed for auth and
  fail-open for reads (documented per route).

## Alternatives considered

- **In-memory per-instance limiting (rejected):** ineffective with more than one instance; the limit is
  effectively multiplied by the instance count.
- **API gateway / reverse-proxy limiting (e.g. nginx) (complementary, not a replacement):** good as an
  outer coarse layer, but cannot apply per-user/per-role application limits; we keep the application-aware
  limit and can add an edge limit in production.
