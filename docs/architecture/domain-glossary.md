# Domain Glossary (Ubiquitous Language)

A shared, precise vocabulary for the evaluation domain. Code, APIs, database tables, and docs use these
exact terms. The language is that of **AI model evaluation / human-in-the-loop review**.

## Actors & roles

| Term          | Definition                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Submitter** | Registers prompts and the model outputs to be evaluated (a person or a machine client via API key). |
| **Reviewer**  | Scores evaluations assigned to them against a rubric and leaves rubric-based feedback.              |
| **Admin**     | Manages rubrics, users/roles, finalization, audit, and analytics.                                   |
| **Principal** | The authenticated identity behind a request; every state change is attributed to one.               |

## Core concepts

| Term                          | Definition                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt**                    | A coding task/specification to be answered by a model — content, language, difficulty, tags. The unit work is evaluated _against_.                                                       |
| **Submission (Model Output)** | A single model's response to a prompt: the candidate code/output plus provenance (model name, version, decoding params). Multiple submissions per prompt enable comparison.              |
| **Evaluation**                | The assessment of one submission: its lifecycle state, automated-check results, assigned reviewer, and the rubric it is scored against. The central aggregate.                           |
| **Automated checks**          | Non-human signals computed by a worker on a submission — static analysis, structural rubric signals, model-output diffing. **No execution of untrusted code in-process** (see ADR 0003). |
| **Rubric**                    | A versioned set of weighted criteria defining _how_ a submission is scored (e.g. correctness, readability, efficiency).                                                                  |
| **Rubric criterion**          | One dimension of a rubric: label, description, weight, and score scale (e.g. 0–5).                                                                                                       |
| **Reviewer score**            | A reviewer's immutable scoring of an evaluation: a score per criterion + comments, yielding a weighted overall score. Corrections create a new version, never an edit.                   |
| **Comparison**                | A judgment across multiple submissions for the same prompt — a ranking or pairwise preference ("output A is better than B"), the data shape RLHF-style preference training consumes.     |
| **Finalization**              | An admin action that locks an evaluation's outcome after scoring (and resolves disputes/overrides).                                                                                      |

## Lifecycle & process terms

| Term                     | Definition                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evaluation state**     | Where an evaluation is in its lifecycle: `PENDING → RUNNING_CHECKS → AWAITING_REVIEW → UNDER_REVIEW → SCORED → FINALIZED`, plus `FAILED` and `CANCELLED`. See [evaluation-lifecycle.md](evaluation-lifecycle.md). |
| **Evaluation history**   | The append-only stream of state-transition events for an evaluation; the authoritative record, supporting point-in-time reconstruction.                                                                           |
| **Assignment**           | Routing a review-ready evaluation to a specific reviewer (or a review pool).                                                                                                                                      |
| **Short / failed check** | An automated check that errors or yields a blocking signal; surfaces as `FAILED` or an exception, retried per the job policy.                                                                                     |
| **Dispute / override**   | A flagged or admin-corrected outcome, recorded as new versions and audit entries — never a silent edit.                                                                                                           |

## Operational & cross-cutting terms

| Term                        | Definition                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Job / queue / worker**    | A unit of async work (BullMQ) on a named Redis-backed queue, processed by a worker; retried with backoff; dead-lettered on exhaustion. |
| **Idempotency key**         | A key (e.g. `evaluationId:stage`) that makes re-processing a redelivered job a no-op.                                                  |
| **Dead-letter queue (DLQ)** | Where a job lands after exhausting retries, for operator visibility instead of loss.                                                   |
| **Correlation id**          | An id tying an API request to all logs and jobs it spawns, across API and workers.                                                     |
| **Audit log**               | The append-only record of security/integrity-relevant actions: actor, action, entity, before/after, timestamp.                         |
| **Available API key**       | A scoped, hashed credential for machine submitters.                                                                                    |

## Naming conventions

- Entities are nouns (`Prompt`, `Submission`, `Evaluation`, `Rubric`, `ReviewerScore`, `Comparison`).
- Use-case names are imperative (`SubmitModelOutput`, `RunAutomatedChecks`, `AssignEvaluation`,
  `ScoreEvaluation`, `FinalizeEvaluation`, `CompareSubmissions`).
- Evaluation states are present/past-tense statuses; transitions are recorded as past-tense history
  events (`ChecksCompleted`, `EvaluationScored`, `EvaluationFinalized`).
- "Submission" and "model output" are the same thing; the code uses **`Submission`** as the entity name.
