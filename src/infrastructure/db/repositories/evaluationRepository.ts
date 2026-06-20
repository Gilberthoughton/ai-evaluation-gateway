import { and, asc, desc, eq, lt, or } from 'drizzle-orm';
import type { EvaluationRecord, EvaluationRepository } from '../../../application/evaluations/ports.js';
import { ConflictError } from '../../../domain/errors.js';
import type { Database } from '../client.js';
import { evaluationEvents, evaluations } from '../schema/index.js';

type Row = typeof evaluations.$inferSelect;

function toRecord(row: Row): EvaluationRecord {
  return {
    id: row.id,
    submissionId: row.submissionId,
    rubricVersionId: row.rubricVersionId,
    status: row.status,
    assigneeId: row.assigneeId,
    automatedResults: row.automatedResults,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createEvaluationRepository(db: Database): EvaluationRepository {
  return {
    async create(input) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(evaluations)
          .values({ submissionId: input.submissionId, rubricVersionId: input.rubricVersionId })
          .returning();
        if (!row) throw new Error('Failed to create evaluation');
        await tx.insert(evaluationEvents).values({
          evaluationId: row.id,
          fromStatus: null,
          toStatus: 'PENDING',
          reason: 'evaluation created',
          actorId: input.actorId,
          correlationId: input.correlationId,
        });
        return toRecord(row);
      });
    },

    async findById(id) {
      const [row] = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },

    async transition(input) {
      return db.transaction(async (tx) => {
        // Optimistic: only update if still in `from`; an empty result means a concurrent change.
        const [row] = await tx
          .update(evaluations)
          .set({
            status: input.to,
            updatedAt: new Date(),
            ...(input.automatedResults !== undefined ? { automatedResults: input.automatedResults } : {}),
          })
          .where(and(eq(evaluations.id, input.evaluationId), eq(evaluations.status, input.from)))
          .returning();
        if (!row) {
          throw new ConflictError(`Evaluation ${input.evaluationId} is not in expected state ${input.from}`);
        }
        await tx.insert(evaluationEvents).values({
          evaluationId: input.evaluationId,
          fromStatus: input.from,
          toStatus: input.to,
          reason: input.reason,
          actorId: input.actorId,
          correlationId: input.correlationId,
        });
        return toRecord(row);
      });
    },

    async listHistory(evaluationId) {
      const rows = await db
        .select()
        .from(evaluationEvents)
        .where(eq(evaluationEvents.evaluationId, evaluationId))
        .orderBy(asc(evaluationEvents.occurredAt), asc(evaluationEvents.id));
      return rows.map((r) => ({
        id: r.id,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        reason: r.reason,
        actorId: r.actorId,
        occurredAt: r.occurredAt,
      }));
    },

    async list({ status, limit, cursor }) {
      const conditions = [];
      if (status) conditions.push(eq(evaluations.status, status));
      if (cursor) {
        conditions.push(
          or(
            lt(evaluations.createdAt, new Date(cursor.createdAt)),
            and(eq(evaluations.createdAt, new Date(cursor.createdAt)), lt(evaluations.id, cursor.id)),
          ),
        );
      }
      const rows = await db
        .select()
        .from(evaluations)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(evaluations.createdAt), desc(evaluations.id))
        .limit(limit);
      return rows.map(toRecord);
    },
  };
}
