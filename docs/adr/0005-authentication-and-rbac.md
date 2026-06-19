# ADR 0005 — JWT access/refresh authentication + role-based access control

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** Engineering

## Context

The platform has three distinct actors with very different powers: **submitters** register prompts and
model outputs, **reviewers** score evaluations assigned to them, and **admins** manage rubrics, users,
finalization, audit, and analytics. Every state-changing action must be attributable to a principal
(the audit log, [ADR 0009](0009-audit-log-and-immutability.md), depends on it). The API is also a
candidate for machine submitters (batch upload of model outputs).

## Decision

**Authentication:** stateless **JWT access tokens** (short-lived, ~15 min) plus **refresh tokens**
(long-lived, rotated, stored hashed in Postgres so they can be revoked). Passwords are hashed with
**argon2id**. Machine clients use scoped, hashed **API keys** for submission endpoints.

**Authorization:** **role-based access control** with roles `ADMIN`, `REVIEWER`, `SUBMITTER`. Roles are
enforced by a Fastify auth decorator/preHandler (`requireRole(...)`) on each route, and resource-level
checks (e.g. a reviewer may only score evaluations assigned to them) live in the application layer.

| Capability | submitter | reviewer | admin |
|------------|:--------:|:-------:|:----:|
| Create prompts / submissions | ✅ | | ✅ |
| View own submissions & results | ✅ | ✅ | ✅ |
| Score assigned evaluations | | ✅ | ✅ |
| Manage rubrics / users / finalize / audit / analytics | | | ✅ |

## Consequences

**Positive**

- Stateless access tokens scale horizontally; refresh-token rotation enables revocation and limits
  blast radius of a leaked token.
- Roles + resource checks give defense in depth; every mutation has an attributable principal for audit.
- argon2id is a current password-hashing standard (memory-hard, tunable).

**Negative / trade-offs**

- Refresh-token storage/rotation adds a table and logic (worth it for revocation).
- RBAC (not ABAC) is coarse; fine-grained, per-resource rules live in the application layer rather than
  in policy data (acceptable for three roles).

## Alternatives considered

- **Sessions + cookies (rejected):** server-side session store and CSRF handling; less natural for a
  token-based API consumed by scripts and multiple clients.
- **Opaque tokens introspected per request (rejected):** a DB/Redis lookup on every call; JWTs avoid that
  for access while refresh rotation still allows revocation.
- **Third-party identity (Auth0/Clerk) (rejected for now):** great for production, but adds an external
  dependency and obscures the auth engineering this project is meant to show; the boundary is an
  `AuthService` port, so adopting an IdP later is localized.
