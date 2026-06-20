import { and, desc, eq, lt, or } from 'drizzle-orm';
import type {
  CreatePromptInput,
  PromptRecord,
  PromptRepository,
} from '../../../application/prompts/ports.js';
import type { Database } from '../client.js';
import { prompts } from '../schema/index.js';

type Row = typeof prompts.$inferSelect;

function toRecord(row: Row): PromptRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    difficulty: row.difficulty,
    tags: row.tags,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function createPromptRepository(db: Database): PromptRepository {
  return {
    async create(input: CreatePromptInput) {
      const [row] = await db
        .insert(prompts)
        .values({
          title: input.title,
          content: input.content,
          language: input.language,
          difficulty: input.difficulty,
          tags: input.tags,
          createdBy: input.createdBy,
        })
        .returning();
      if (!row) throw new Error('Failed to create prompt');
      return toRecord(row);
    },
    async findById(id) {
      const [row] = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },
    async list({ limit, cursor }) {
      // Keyset pagination on (createdAt, id) descending — stable under inserts and tie-safe.
      const where = cursor
        ? or(
            lt(prompts.createdAt, new Date(cursor.createdAt)),
            and(eq(prompts.createdAt, new Date(cursor.createdAt)), lt(prompts.id, cursor.id)),
          )
        : undefined;
      const rows = await db
        .select()
        .from(prompts)
        .where(where)
        .orderBy(desc(prompts.createdAt), desc(prompts.id))
        .limit(limit);
      return rows.map(toRecord);
    },
  };
}
