import { assertTransition, type EvaluationStatus } from '../../domain/evaluation/stateMachine.js';
import { NotFoundError } from '../../domain/errors.js';
import { decodeCursor, encodeCursor, MAX_LIMIT, type Page } from '../pagination.js';
import type { SubmissionRepository } from '../prompts/ports.js';
import type { RubricRepository } from '../rubrics/ports.js';
import { runStaticChecks } from './automatedChecker.js';
import type {
  EvaluationEventRecord,
  EvaluationJobQueue,
  EvaluationRecord,
  EvaluationRepository,
} from './ports.js';

export class EvaluationService {
  constructor(
    private readonly evaluations: EvaluationRepository,
    private readonly submissions: SubmissionRepository,
    private readonly rubrics: RubricRepository,
    private readonly queue: EvaluationJobQueue,
  ) {}

  async startEvaluation(input: {
    submissionId: string;
    rubricId: string;
    actorId: string;
    correlationId: string | null;
  }): Promise<EvaluationRecord> {
    const submission = await this.submissions.findById(input.submissionId);
    if (!submission) throw new NotFoundError(`Submission ${input.submissionId} not found`);

    const rubricVersion = await this.rubrics.findLatestVersion(input.rubricId);
    if (!rubricVersion) throw new NotFoundError(`Rubric ${input.rubricId} has no published version`);

    const evaluation = await this.evaluations.create({
      submissionId: input.submissionId,
      rubricVersionId: rubricVersion.id,
      actorId: input.actorId,
      correlationId: input.correlationId,
    });

    await this.queue.enqueueAutomatedChecks(evaluation.id, input.correlationId);
    return evaluation;
  }

  async getEvaluation(id: string): Promise<EvaluationRecord> {
    const evaluation = await this.evaluations.findById(id);
    if (!evaluation) throw new NotFoundError(`Evaluation ${id} not found`);
    return evaluation;
  }

  async listHistory(id: string): Promise<EvaluationEventRecord[]> {
    await this.getEvaluation(id);
    return this.evaluations.listHistory(id);
  }

  async list(params: {
    status?: EvaluationStatus | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<Page<EvaluationRecord>> {
    const limit = Math.min(params.limit ?? 20, MAX_LIMIT);
    const rows = await this.evaluations.list({
      status: params.status,
      limit,
      cursor: decodeCursor(params.cursor),
    });
    const last = rows.length === limit ? rows[rows.length - 1] : undefined;
    return {
      data: rows,
      nextCursor: last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async cancel(id: string, actorId: string, correlationId: string | null): Promise<EvaluationRecord> {
    const evaluation = await this.getEvaluation(id);
    assertTransition(evaluation.status, 'CANCELLED');
    return this.evaluations.transition({
      evaluationId: id,
      from: evaluation.status,
      to: 'CANCELLED',
      reason: 'cancelled by admin',
      actorId,
      correlationId,
    });
  }

  /**
   * Worker entry: runs automated checks for an evaluation and advances it to AWAITING_REVIEW.
   * Idempotent — safe to run more than once (at-least-once delivery): it no-ops if the evaluation
   * has already moved past the checks, and resumes from RUNNING_CHECKS if a prior attempt crashed.
   */
  async runAutomatedChecks(evaluationId: string, correlationId: string | null = null): Promise<void> {
    const evaluation = await this.evaluations.findById(evaluationId);
    if (!evaluation) return;

    if (evaluation.status === 'PENDING') {
      await this.evaluations.transition({
        evaluationId,
        from: 'PENDING',
        to: 'RUNNING_CHECKS',
        reason: 'automated checks started',
        actorId: null,
        correlationId,
      });
    } else if (evaluation.status !== 'RUNNING_CHECKS') {
      return; // already checked / terminal — nothing to do
    }

    const submission = await this.submissions.findById(evaluation.submissionId);
    const results = runStaticChecks(submission?.output ?? '');

    await this.evaluations.transition({
      evaluationId,
      from: 'RUNNING_CHECKS',
      to: 'AWAITING_REVIEW',
      reason: 'automated checks completed',
      actorId: null,
      correlationId,
      automatedResults: results,
    });
  }
}
