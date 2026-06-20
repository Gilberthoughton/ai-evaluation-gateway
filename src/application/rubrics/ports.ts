export interface CriterionInput {
  key: string;
  label: string;
  description: string | null;
  weight: number;
  scaleMin: number;
  scaleMax: number;
}

export interface RubricCriterionRecord extends CriterionInput {
  id: string;
}

export interface RubricVersionRecord {
  id: string;
  rubricId: string;
  version: number;
  publishedAt: Date;
  criteria: RubricCriterionRecord[];
}

export interface RubricRecord {
  id: string;
  name: string;
  createdAt: Date;
  versions: RubricVersionRecord[];
}

export interface RubricRepository {
  create(input: { name: string; criteria: CriterionInput[] }): Promise<RubricRecord>;
  publishVersion(rubricId: string, criteria: CriterionInput[]): Promise<RubricVersionRecord>;
  findById(id: string): Promise<RubricRecord | null>;
  list(): Promise<RubricRecord[]>;
  findLatestVersion(rubricId: string): Promise<RubricVersionRecord | null>;
}
