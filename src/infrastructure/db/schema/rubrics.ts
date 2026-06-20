import { integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const rubrics = pgTable('rubrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rubricVersions = pgTable(
  'rubric_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rubricId: uuid('rubric_id')
      .notNull()
      .references(() => rubrics.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_rubric_version').on(t.rubricId, t.version)],
);

export const rubricCriteria = pgTable(
  'rubric_criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rubricVersionId: uuid('rubric_version_id')
      .notNull()
      .references(() => rubricVersions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    weight: numeric('weight', { precision: 5, scale: 2 }).notNull(),
    scaleMin: integer('scale_min').notNull().default(0),
    scaleMax: integer('scale_max').notNull().default(5),
  },
  (t) => [unique('uq_criterion_key').on(t.rubricVersionId, t.key)],
);
