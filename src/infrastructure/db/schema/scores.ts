import { integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { evaluations } from './evaluations.js';
import { rubricCriteria } from './rubrics.js';
import { users } from './users.js';

/** A reviewer's scoring of an evaluation. Corrections create a new version; rows are never edited. */
export const reviewerScores = pgTable(
  'reviewer_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    version: integer('version').notNull(),
    overallScore: numeric('overall_score', { precision: 6, scale: 3 }).notNull(),
    comment: text('comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_score_version').on(t.evaluationId, t.reviewerId, t.version)],
);

export const scoreItems = pgTable('score_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  scoreId: uuid('score_id')
    .notNull()
    .references(() => reviewerScores.id, { onDelete: 'cascade' }),
  criterionId: uuid('criterion_id')
    .notNull()
    .references(() => rubricCriteria.id),
  value: integer('value').notNull(),
  comment: text('comment'),
});
