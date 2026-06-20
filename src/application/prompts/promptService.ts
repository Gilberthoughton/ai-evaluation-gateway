import { NotFoundError } from '../../domain/errors.js';
import { decodeCursor, encodeCursor, MAX_LIMIT, type Page } from '../pagination.js';
import type {
  CreatePromptInput,
  CreateSubmissionInput,
  PromptRecord,
  PromptRepository,
  SubmissionRecord,
  SubmissionRepository,
} from './ports.js';

export class PromptService {
  constructor(
    private readonly prompts: PromptRepository,
    private readonly submissions: SubmissionRepository,
  ) {}

  createPrompt(input: CreatePromptInput): Promise<PromptRecord> {
    return this.prompts.create(input);
  }

  async getPrompt(id: string): Promise<PromptRecord> {
    const prompt = await this.prompts.findById(id);
    if (!prompt) throw new NotFoundError(`Prompt ${id} not found`);
    return prompt;
  }

  async listPrompts(params: {
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<Page<PromptRecord>> {
    const limit = Math.min(params.limit ?? 20, MAX_LIMIT);
    const rows = await this.prompts.list({ limit, cursor: decodeCursor(params.cursor) });
    const last = rows.length === limit ? rows[rows.length - 1] : undefined;
    return {
      data: rows,
      nextCursor: last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async addSubmission(input: CreateSubmissionInput): Promise<SubmissionRecord> {
    await this.getPrompt(input.promptId); // 404 if the prompt does not exist
    return this.submissions.create(input);
  }

  async getSubmission(id: string): Promise<SubmissionRecord> {
    const submission = await this.submissions.findById(id);
    if (!submission) throw new NotFoundError(`Submission ${id} not found`);
    return submission;
  }

  async listSubmissions(promptId: string): Promise<SubmissionRecord[]> {
    await this.getPrompt(promptId);
    return this.submissions.listByPrompt(promptId);
  }
}
