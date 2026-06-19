# API Design

A resource-oriented REST API, versioned under `/api/v1`, validated by Zod and documented as OpenAPI 3
(Swagger UI at `/docs`). All payloads are JSON. Every request is authenticated except `/auth/login`,
`/health`, and `/docs`.

## Conventions

- **Auth:** `Authorization: Bearer <jwt>` (access token) or `X-API-Key: <key>` for machine submitters
  ([ADR 0005](../adr/0005-authentication-and-rbac.md)).
- **Correlation:** clients may send `X-Correlation-Id`; the response echoes it (generated if absent).
- **Validation:** request bodies/params/queries are Zod-validated; failures return `400` problem+json.
- **Errors:** RFC 7807 `application/problem+json` with `status`, `title`, `detail`, `correlationId`
  ([ADR 0008](../adr/0008-logging-and-error-model.md)).
- **Pagination:** list endpoints take `?limit=` (default 20, max 100) and `?cursor=`; responses return
  `{ data: [...], nextCursor: string | null }` (keyset pagination).
- **Idempotency:** unsafe creation endpoints accept an optional `Idempotency-Key` header.
- **Rate limits:** `RateLimit-*` headers on every response; `429` + `Retry-After` when exceeded.

## Resources & endpoints

### Auth
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/auth/login` | public | Exchange credentials for an access + refresh token. |
| POST | `/auth/refresh` | any | Rotate a refresh token for a new access token. |
| POST | `/auth/logout` | any | Revoke the current refresh token. |
| GET | `/auth/me` | any | The authenticated principal (id, role). |

### Users (admin)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/users` | admin | Create a user (role: submitter / reviewer / admin). |
| GET | `/users` | admin | List users. |
| PATCH | `/users/:id` | admin | Update role/status (audited). |

### Prompts
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/prompts` | submitter, admin | Register a coding prompt. |
| GET | `/prompts` | any | List prompts (filter by `language`, `tag`, `status`). |
| GET | `/prompts/:id` | any | Get a prompt. |

### Submissions (model outputs)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/prompts/:id/submissions` | submitter, admin | Add a model output for a prompt. |
| GET | `/prompts/:id/submissions` | any | List a prompt's submissions (the comparison set). |
| GET | `/submissions/:id` | any | Get a submission. |

### Evaluations
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/submissions/:id/evaluations` | submitter, admin | Start an evaluation (enqueues automated checks); `202` + evaluationId. |
| GET | `/evaluations/:id` | any (scoped) | Get an evaluation (state, automated results, assignment). |
| GET | `/evaluations` | reviewer, admin | List/filter by `status`, `assignee`, `promptId`. |
| GET | `/evaluations/:id/history` | any (scoped) | The append-only state-transition history. |
| POST | `/evaluations/:id/cancel` | admin | Cancel an evaluation (compensating). |
| POST | `/evaluations/:id/finalize` | admin | Lock the outcome after scoring. |

### Reviewer scoring
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/evaluations/:id/rubric` | reviewer, admin | The rubric (version) this evaluation is scored against. |
| POST | `/evaluations/:id/scores` | reviewer, admin | Submit a rubric-based score (per-criterion + comments). Reviewer must be the assignee. |
| GET | `/evaluations/:id/scores` | reviewer, admin | The scores recorded for an evaluation (all versions). |

### Rubrics (admin)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/rubrics` | admin | Create a rubric with weighted criteria (version 1). |
| POST | `/rubrics/:id/versions` | admin | Publish a new version (immutable; prior versions retained). |
| GET | `/rubrics` / `/rubrics/:id` | any | List / fetch rubrics. |

### Comparisons (model output comparison)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/prompts/:id/comparisons` | reviewer, admin | Rank/pairwise-prefer submissions for a prompt. |
| GET | `/comparisons/:id` | any (scoped) | Get a comparison result. |

### Analytics
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/analytics/models` | admin | Model leaderboard: aggregate scores per model/version. |
| GET | `/analytics/reviewers` | admin | Reviewer throughput and inter-reviewer agreement. |
| GET | `/analytics/prompts/:id` | admin | Score distribution for a prompt's submissions. |

### Audit & ops
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/audit` | admin | Query the append-only audit log (by actor/entity/date). |
| GET | `/health` | public | Liveness. |
| GET | `/ready` | public | Readiness (DB + Redis reachable). |
| GET | `/docs` | public | Swagger UI (OpenAPI 3). |

## Representative request/response

`POST /api/v1/submissions/{id}/evaluations` →

```json
// 202 Accepted
{ "evaluationId": "c0ffee...", "status": "PENDING", "submissionId": "...", "rubricVersionId": "..." }
```

`POST /api/v1/evaluations/{id}/scores` (reviewer) →

```json
// request
{ "criteria": [ { "criterionId": "corr", "score": 4 }, { "criterionId": "read", "score": 5 } ],
  "comment": "Correct and idiomatic; minor edge case missed." }
// 201 Created
{ "scoreId": "...", "overallScore": 4.4, "version": 1, "submittedAt": "2026-06-19T..." }
```

Error example (RFC 7807):

```json
// 403 application/problem+json
{ "type": "about:blank", "title": "Forbidden", "status": 403,
  "detail": "Reviewer may only score assigned evaluations", "correlationId": "..." }
```

## Status codes (house rules)

`200` read · `201` resource created · `202` accepted (async evaluation started) · `400` validation ·
`401` unauthenticated · `403` role/ownership · `404` not found · `409` conflict (duplicate / illegal
state transition) · `422` semantically invalid (e.g. score outside rubric scale) · `429` rate limited ·
`500` unexpected (generic problem, details logged).
