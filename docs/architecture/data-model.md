# Data Model

PostgreSQL schema, defined in TypeScript with Drizzle and migrated via drizzle-kit
([ADR 0002](../adr/0002-drizzle-orm.md)). This document is a design reference; concrete migrations land
in Phase 1. SQL below is illustrative DDL. Conventions: UUID primary keys, `created_at`/`updated_at`
timestamps (except append-only tables, which carry only `occurred_at`), foreign keys with explicit
indexes, and Postgres `enum`s for closed sets.

## Identity & auth

```sql
CREATE TYPE user_role AS ENUM ('SUBMITTER', 'REVIEWER', 'ADMIN');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                 -- argon2id
    role          user_role NOT NULL,
    status        TEXT NOT NULL DEFAULT 'ACTIVE',-- ACTIVE | DISABLED
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (            -- rotated; hashed; revocable (ADR 0005)
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE api_keys (                  -- machine submitters; hashed + scoped
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id),
    key_hash    TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    scopes      TEXT[] NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Prompts & submissions (model outputs)

```sql
CREATE TABLE prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,             -- the task / specification
    language    TEXT NOT NULL,             -- e.g. 'python', 'typescript'
    difficulty  TEXT,                      -- e.g. 'easy' | 'medium' | 'hard'
    tags        TEXT[] NOT NULL DEFAULT '{}',
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prompts_language ON prompts (language);

CREATE TABLE submissions (               -- a single model output for a prompt
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id     UUID NOT NULL REFERENCES prompts(id),
    model_name    TEXT NOT NULL,
    model_version TEXT,
    output        TEXT NOT NULL,          -- the candidate code / answer
    metadata      JSONB NOT NULL DEFAULT '{}', -- decoding params, source, etc.
    submitted_by  UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_submissions_prompt ON submissions (prompt_id);
```

## Rubrics (versioned, immutable)

```sql
CREATE TABLE rubrics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rubric_versions (           -- a published version is immutable (ADR 0009)
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id   UUID NOT NULL REFERENCES rubrics(id),
    version     INT  NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rubric_id, version)
);

CREATE TABLE rubric_criteria (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id),
    key               TEXT NOT NULL,      -- stable id, e.g. 'correctness'
    label             TEXT NOT NULL,
    description       TEXT,
    weight            NUMERIC(5,2) NOT NULL,  -- relative weight
    scale_min         INT NOT NULL DEFAULT 0,
    scale_max         INT NOT NULL DEFAULT 5,
    UNIQUE (rubric_version_id, key)
);
```

## Evaluations + append-only history

```sql
CREATE TYPE evaluation_status AS ENUM
    ('PENDING','RUNNING_CHECKS','AWAITING_REVIEW','UNDER_REVIEW','SCORED','FINALIZED','FAILED','CANCELLED');

CREATE TABLE evaluations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES submissions(id),
    rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id),
    status            evaluation_status NOT NULL DEFAULT 'PENDING', -- derived from latest event
    assignee_id       UUID REFERENCES users(id),
    automated_results JSONB,              -- static-analysis / structural signals
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eval_status ON evaluations (status);
CREATE INDEX idx_eval_assignee ON evaluations (assignee_id) WHERE assignee_id IS NOT NULL;

CREATE TABLE evaluation_events (         -- append-only authoritative history (ADR 0009)
    id             BIGSERIAL PRIMARY KEY,
    evaluation_id  UUID NOT NULL REFERENCES evaluations(id),
    from_status    evaluation_status,
    to_status      evaluation_status NOT NULL,
    reason         TEXT,
    actor_id       UUID REFERENCES users(id),  -- null for system/worker transitions
    correlation_id UUID,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eval_events_eval ON evaluation_events (evaluation_id, occurred_at);
```

## Reviewer scores (versioned, never edited)

```sql
CREATE TABLE reviewer_scores (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id),
    reviewer_id   UUID NOT NULL REFERENCES users(id),
    version       INT  NOT NULL,          -- a correction creates a new version
    overall_score NUMERIC(6,3) NOT NULL,  -- weighted from items
    comment       TEXT,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_id, reviewer_id, version)
);

CREATE TABLE score_items (               -- one row per rubric criterion
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_id     UUID NOT NULL REFERENCES reviewer_scores(id),
    criterion_id UUID NOT NULL REFERENCES rubric_criteria(id),
    value        INT NOT NULL,           -- within the criterion scale
    comment      TEXT
);
```

## Comparisons (model output comparison)

```sql
CREATE TABLE comparisons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id   UUID NOT NULL REFERENCES prompts(id),
    method      TEXT NOT NULL,           -- 'RANKING' | 'PAIRWISE'
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comparison_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_id UUID NOT NULL REFERENCES comparisons(id),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    rank          INT,                   -- for RANKING
    preferred_over UUID REFERENCES submissions(id) -- for PAIRWISE
);
```

## Audit log (append-only)

```sql
CREATE TABLE audit_logs (                -- INSERT/SELECT only for the app DB role (ADR 0009)
    id             BIGSERIAL PRIMARY KEY,
    actor_id       UUID REFERENCES users(id),
    action         TEXT NOT NULL,        -- e.g. 'EVALUATION_SCORED', 'ROLE_CHANGED'
    entity_type    TEXT NOT NULL,
    entity_id      UUID,
    before         JSONB,                -- redacted snapshot
    after          JSONB,                -- redacted snapshot
    correlation_id UUID,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, occurred_at);
CREATE INDEX idx_audit_actor  ON audit_logs (actor_id, occurred_at);
```

## How the model enforces the architecture

| Guarantee | Enforced by |
|-----------|-------------|
| Attributable actions | FKs to `users`; `actor_id` on history + audit. |
| Immutable history | `evaluation_events` / `audit_logs` append-only; app DB role lacks UPDATE/DELETE on them. |
| Immutable scores & rubrics | Versioned rows (`reviewer_scores.version`, `rubric_versions.version`); corrections add versions. |
| Point-in-time reconstruction | Fold `evaluation_events` up to a timestamp. |
| Comparison data for preference training | `comparisons` + `comparison_items` (ranking / pairwise). |
| Service isolation | The two deployables (API, worker) share one schema now; tables are grouped so a future split is localized. |
