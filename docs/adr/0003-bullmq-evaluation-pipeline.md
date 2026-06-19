# ADR 0003 — BullMQ on Redis for the async evaluation pipeline

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

Evaluating a model output is not a request/response operation. When a submission is evaluated, the
system runs **automated checks** (static analysis, structural rubric signals, model-output diffing)
and then routes the result for human review. These steps are slow, may fail transiently, must be
retried, and must never block the API request that triggered them. We need durable background jobs
with retries, backoff, concurrency control, and dead-lettering.

## Decision

Use **BullMQ on Redis** for the evaluation pipeline. Each stage is a named queue processed by
**worker** processes, separate from the API:

- `evaluation.automated` — run automated checks for a submission, persist results, advance state.
- `evaluation.assignment` — assign a scored-ready evaluation to a reviewer (or a review pool).
- `audit` / `notifications` — fan-out side effects asynchronously.

Reliability properties:

- **Idempotency:** jobs are keyed by `(evaluationId, stage)`; a redelivered job detects completed work
  and no-ops, so at-least-once processing is safe.
- **Retries with backoff:** transient failures retry with exponential backoff and a capped attempt count.
- **Dead-letter queue:** a job that exhausts retries moves to a `*.dead` queue, surfaces an
  `EvaluationException`, and is visible to operators rather than lost.
- **Concurrency & rate control:** worker concurrency and limiter settings bound load on Postgres and
  any external analyzers.

> **Security note.** Automated checks operate on _untrusted_ model output. The default checks are
> **static/structural only** (no execution of submitted code). Any future capability that _runs_
> submitted code MUST do so in an isolated sandbox (no network, CPU/memory/time limits, ephemeral
> filesystem) — never in the worker process. This is a hard requirement, not a later nicety.

## Consequences

**Positive**

- The API responds immediately; heavy work runs out-of-band and scales by adding workers.
- Retries, backoff, and DLQ give operational reliability and visibility for free.
- Redis is already present for rate limiting ([ADR 0007](0007-rate-limiting.md)) — one dependency, two uses.

**Negative / trade-offs**

- Redis becomes a critical dependency for evaluation progress (mitigated by persistence + the DB being
  the source of truth for evaluation state, so jobs are reconstructable).
- Exactly-once is not achievable; consumers must be idempotent (designed in).

## Alternatives considered

- **Postgres-backed queue (e.g. pg-boss) (considered):** one fewer datastore, transactional with the
  domain data. Rejected as the primary because Redis/BullMQ offers richer rate/concurrency control and a
  mature dashboard, and Redis is needed anyway; pg-boss remains a viable fallback if Redis is dropped.
- **Synchronous in-request evaluation (rejected):** ties up the API, no retries, fails the whole request
  on a transient analyzer error.
- **Kafka (rejected):** excellent for event streaming, but this is _work distribution with per-job acks,
  retries, and dead-lettering_ — a job queue, not an event log. (See the order-platform project for the
  Kafka-vs-queue distinction.)
