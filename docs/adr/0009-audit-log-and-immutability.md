# ADR 0009 — Append-only audit log + immutable evaluation history

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

Evaluation data is the substrate of AI training decisions, so **trust and traceability** are core
requirements, not nice-to-haves. Reviewers and admins take consequential actions — scoring outputs,
overriding results, finalizing evaluations, changing rubrics. We must be able to answer "who scored
this, against which rubric version, and when?" and "what was the evaluation's state last Tuesday?"
long after the fact, and we must prevent silent edits to historical results.

## Decision

Two complementary, append-only records:

1. **Evaluation history (`evaluation_events`)** — every evaluation **state transition** is written as an
   immutable event (`from`, `to`, `reason`, `actorId`, `occurredAt`, `correlationId`). The evaluation's
   current status is a convenience column derived from the latest event; the event stream is the
   authoritative history and supports point-in-time reconstruction.
2. **Audit log (`audit_logs`)** — every security- or integrity-relevant action (login, role change,
   rubric change, score submission, finalize, override) is recorded as an immutable entry: `actorId`,
   `action`, `entityType`, `entityId`, a redacted `before`/`after` snapshot, `correlationId`,
   `occurredAt`.

**Immutability is enforced, not just intended:**

- Scores and rubric versions are **versioned, not edited** — a correction creates a new
  `reviewer_score` / `rubric` version; prior versions remain.
- Audit and history tables are **append-only at the application layer**, and the database role used by
  the app is granted `INSERT`/`SELECT` (no `UPDATE`/`DELETE`) on those tables.

## Consequences

**Positive**

- Full traceability: every result is attributable to a principal, a rubric version, and a timestamp.
- Tamper-resistance: historical results cannot be silently changed; corrections are visible as new
  versions.
- Point-in-time reconstruction of any evaluation from its event stream.

**Negative / trade-offs**

- More writes and storage; audit/history tables grow (addressed by time-based partitioning/archival of
  cold rows, never deletion of live history).
- Corrections-as-new-versions require read models/queries to select the current version explicitly.

## Alternatives considered

- **Mutable rows with an `updated_at` column (rejected):** loses history and enables silent edits —
  unacceptable for evaluation data.
- **Full event sourcing of all aggregates (rejected as overkill):** the order-platform project shows
  event sourcing where it pays off; here, append-only history for *evaluations* plus a cross-cutting
  audit log delivers the needed guarantees without sourcing every entity.
- **Database triggers for audit (considered):** robust, but couples audit semantics to the schema and is
  harder to enrich with application context (actor, correlation id); the app-layer + restricted DB
  grants approach keeps context while still preventing mutation.
