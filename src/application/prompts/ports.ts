import type { Cursor } from '../pagination.js';

export interface PromptRecord {
  id: string;
  title: string;
  content: string;
  language: string;
  difficulty: string | null;
  tags: string[];
  createdBy: string;
  createdAt: Date;
}

export interface CreatePromptInput {
  title: string;
  content: string;
  language: string;
  difficulty: string | null;
  tags: string[];
  createdBy: string;
}

export interface PromptRepository {
  create(input: CreatePromptInput): Promise<PromptRecord>;
  findById(id: string): Promise<PromptRecord | null>;
  list(params: { limit: number; cursor: Cursor | null }): Promise<PromptRecord[]>;
}

export interface SubmissionRecord {
  id: string;
  promptId: string;
  modelName: string;
  modelVersion: string | null;
  output: string;
  metadata: Record<string, unknown>;
  submittedBy: string;
  createdAt: Date;
}

export interface CreateSubmissionInput {
  promptId: string;
  modelName: string;
  modelVersion: string | null;
  output: string;
  metadata: Record<string, unknown>;
  submittedBy: string;
}

export interface SubmissionRepository {
  create(input: CreateSubmissionInput): Promise<SubmissionRecord>;
  findById(id: string): Promise<SubmissionRecord | null>;
  listByPrompt(promptId: string): Promise<SubmissionRecord[]>;
}
