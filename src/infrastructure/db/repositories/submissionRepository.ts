import { desc, eq } from 'drizzle-orm';
import type {
  CreateSubmissionInput,
  SubmissionRecord,
  SubmissionRepository,
} from '../../../application/prompts/ports.js';
import type { Database } from '../client.js';
import { submissions } from '../schema/index.js';

type Row = typeof submissions.$inferSelect;

function toRecord(row: Row): SubmissionRecord {
  return {
    id: row.id,
    promptId: row.promptId,
    modelName: row.modelName,
    modelVersion: row.modelVersion,
    output: row.output,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    submittedBy: row.submittedBy,
    createdAt: row.createdAt,
  };
}

export function createSubmissionRepository(db: Database): SubmissionRepository {
  return {
    async create(input: CreateSubmissionInput) {
      const [row] = await db
        .insert(submissions)
        .values({
          promptId: input.promptId,
          modelName: input.modelName,
          modelVersion: input.modelVersion,
          output: input.output,
          metadata: input.metadata,
          submittedBy: input.submittedBy,
        })
        .returning();
      if (!row) throw new Error('Failed to create submission');
      return toRecord(row);
    },
    async findById(id) {
      const [row] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },
    async listByPrompt(promptId) {
      const rows = await db
        .select()
        .from(submissions)
        .where(eq(submissions.promptId, promptId))
        .orderBy(desc(submissions.createdAt));
      return rows.map(toRecord);
    },
  };
}
