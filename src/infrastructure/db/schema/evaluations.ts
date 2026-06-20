import { bigserial, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { submissions } from './prompts.js';
import { rubricVersions } from './rubrics.js';
import { users } from './users.js';

export const evaluationStatus = pgEnum('evaluation_status', [
  'PENDING',
  'RUNNING_CHECKS',
  'AWAITING_REVIEW',
  'UNDER_REVIEW',
  'SCORED',
  'FINALIZED',
  'FAILED',
  'CANCELLED',
]);

export const evaluations = pgTable(
  'evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    rubricVersionId: uuid('rubric_version_id')
      .notNull()
      .references(() => rubricVersions.id),
    status: evaluationStatus('status').notNull().default('PENDING'),
    assigneeId: uuid('assignee_id').references(() => users.id),
    automatedResults: jsonb('automated_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_eval_status').on(t.status), index('idx_eval_assignee').on(t.assigneeId)],
);

/** Append-only authoritative history of evaluation state transitions (ADR 0009). */
export const evaluationEvents = pgTable(
  'evaluation_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id),
    fromStatus: evaluationStatus('from_status'),
    toStatus: evaluationStatus('to_status').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => users.id),
    correlationId: uuid('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_eval_events').on(t.evaluationId, t.occurredAt)],
);
