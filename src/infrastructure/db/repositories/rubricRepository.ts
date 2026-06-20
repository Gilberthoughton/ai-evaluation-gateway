import { desc, eq } from 'drizzle-orm';
import type {
  CriterionInput,
  RubricCriterionRecord,
  RubricRecord,
  RubricRepository,
  RubricVersionRecord,
} from '../../../application/rubrics/ports.js';
import type { Database } from '../client.js';
import { rubricCriteria, rubricVersions, rubrics } from '../schema/index.js';

type CriterionRow = typeof rubricCriteria.$inferSelect;
type VersionRow = typeof rubricVersions.$inferSelect;

function toCriterion(row: CriterionRow): RubricCriterionRecord {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    weight: Number(row.weight),
    scaleMin: row.scaleMin,
    scaleMax: row.scaleMax,
  };
}

function criterionValues(versionId: string, criteria: CriterionInput[]) {
  return criteria.map((c) => ({
    rubricVersionId: versionId,
    key: c.key,
    label: c.label,
    description: c.description,
    weight: c.weight.toString(),
    scaleMin: c.scaleMin,
    scaleMax: c.scaleMax,
  }));
}

export function createRubricRepository(db: Database): RubricRepository {
  async function hydrateVersion(versionRow: VersionRow): Promise<RubricVersionRecord> {
    const criteria = await db
      .select()
      .from(rubricCriteria)
      .where(eq(rubricCriteria.rubricVersionId, versionRow.id));
    return {
      id: versionRow.id,
      rubricId: versionRow.rubricId,
      version: versionRow.version,
      publishedAt: versionRow.publishedAt,
      criteria: criteria.map(toCriterion),
    };
  }

  async function hydrateRubric(rubricId: string, name: string, createdAt: Date): Promise<RubricRecord> {
    const versionRows = await db
      .select()
      .from(rubricVersions)
      .where(eq(rubricVersions.rubricId, rubricId))
      .orderBy(rubricVersions.version);
    const versions = await Promise.all(versionRows.map((v) => hydrateVersion(v)));
    return { id: rubricId, name, createdAt, versions };
  }

  return {
    async create({ name, criteria }) {
      return db.transaction(async (tx) => {
        const [rubricRow] = await tx.insert(rubrics).values({ name }).returning();
        if (!rubricRow) throw new Error('Failed to create rubric');
        const [versionRow] = await tx
          .insert(rubricVersions)
          .values({ rubricId: rubricRow.id, version: 1 })
          .returning();
        if (!versionRow) throw new Error('Failed to create rubric version');
        const inserted = await tx
          .insert(rubricCriteria)
          .values(criterionValues(versionRow.id, criteria))
          .returning();
        return {
          id: rubricRow.id,
          name: rubricRow.name,
          createdAt: rubricRow.createdAt,
          versions: [
            {
              id: versionRow.id,
              rubricId: rubricRow.id,
              version: 1,
              publishedAt: versionRow.publishedAt,
              criteria: inserted.map(toCriterion),
            },
          ],
        };
      });
    },

    async publishVersion(rubricId, criteria) {
      return db.transaction(async (tx) => {
        const [latest] = await tx
          .select()
          .from(rubricVersions)
          .where(eq(rubricVersions.rubricId, rubricId))
          .orderBy(desc(rubricVersions.version))
          .limit(1);
        const nextVersion = (latest?.version ?? 0) + 1;
        const [versionRow] = await tx
          .insert(rubricVersions)
          .values({ rubricId, version: nextVersion })
          .returning();
        if (!versionRow) throw new Error('Failed to publish rubric version');
        const inserted = await tx
          .insert(rubricCriteria)
          .values(criterionValues(versionRow.id, criteria))
          .returning();
        return {
          id: versionRow.id,
          rubricId,
          version: nextVersion,
          publishedAt: versionRow.publishedAt,
          criteria: inserted.map(toCriterion),
        };
      });
    },

    async findById(id) {
      const [rubricRow] = await db.select().from(rubrics).where(eq(rubrics.id, id)).limit(1);
      return rubricRow ? hydrateRubric(rubricRow.id, rubricRow.name, rubricRow.createdAt) : null;
    },

    async list() {
      const rubricRows = await db.select().from(rubrics).orderBy(desc(rubrics.createdAt));
      return Promise.all(rubricRows.map((r) => hydrateRubric(r.id, r.name, r.createdAt)));
    },

    async findLatestVersion(rubricId) {
      const [versionRow] = await db
        .select()
        .from(rubricVersions)
        .where(eq(rubricVersions.rubricId, rubricId))
        .orderBy(desc(rubricVersions.version))
        .limit(1);
      return versionRow ? hydrateVersion(versionRow) : null;
    },
  };
}
