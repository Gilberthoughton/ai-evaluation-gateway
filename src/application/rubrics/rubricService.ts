import { NotFoundError, ValidationError } from '../../domain/errors.js';
import type { CriterionInput, RubricRecord, RubricRepository, RubricVersionRecord } from './ports.js';

export class RubricService {
  constructor(private readonly rubrics: RubricRepository) {}

  createRubric(input: { name: string; criteria: CriterionInput[] }): Promise<RubricRecord> {
    assertCriteria(input.criteria);
    return this.rubrics.create(input);
  }

  async publishVersion(rubricId: string, criteria: CriterionInput[]): Promise<RubricVersionRecord> {
    assertCriteria(criteria);
    await this.getRubric(rubricId); // 404 if the rubric does not exist
    return this.rubrics.publishVersion(rubricId, criteria);
  }

  async getRubric(id: string): Promise<RubricRecord> {
    const rubric = await this.rubrics.findById(id);
    if (!rubric) throw new NotFoundError(`Rubric ${id} not found`);
    return rubric;
  }

  list(): Promise<RubricRecord[]> {
    return this.rubrics.list();
  }

  async getLatestVersion(rubricId: string): Promise<RubricVersionRecord> {
    const version = await this.rubrics.findLatestVersion(rubricId);
    if (!version) throw new NotFoundError(`Rubric ${rubricId} has no published version`);
    return version;
  }
}

function assertCriteria(criteria: CriterionInput[]): void {
  if (criteria.length === 0) {
    throw new ValidationError('A rubric must have at least one criterion');
  }
  const keys = new Set<string>();
  for (const criterion of criteria) {
    if (keys.has(criterion.key)) {
      throw new ValidationError(`Duplicate criterion key: ${criterion.key}`);
    }
    keys.add(criterion.key);
    if (criterion.scaleMin >= criterion.scaleMax) {
      throw new ValidationError(`Criterion ${criterion.key}: scaleMin must be less than scaleMax`);
    }
    if (criterion.weight <= 0) {
      throw new ValidationError(`Criterion ${criterion.key}: weight must be positive`);
    }
  }
}
