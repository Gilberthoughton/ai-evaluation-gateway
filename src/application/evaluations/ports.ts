import type { EvaluationStatus } from '../../domain/evaluation/stateMachine.js';
import type { Cursor } from '../pagination.js';

export interface EvaluationRecord {
  id: string;
  submissionId: string;
  rubricVersionId: string;
  status: EvaluationStatus;
  assigneeId: string | null;
  automatedResults: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvaluationEventRecord {
  id: number;
  fromStatus: EvaluationStatus | null;
  toStatus: EvaluationStatus;
  reason: string | null;
  actorId: string | null;
  occurredAt: Date;
}

export interface CreateEvaluationInput {
  submissionId: string;
  rubricVersionId: string;
  actorId: string | null;
  correlationId: string | null;
}

export interface TransitionInput {
  evaluationId: string;
  from: EvaluationStatus;
  to: EvaluationStatus;
  reason: string | null;
  actorId: string | null;
  correlationId: string | null;
  automatedResults?: unknown;
}

export interface EvaluationRepository {
  /** Inserts a PENDING evaluation and its initial history event in one transaction. */
  create(input: CreateEvaluationInput): Promise<EvaluationRecord>;
  findById(id: string): Promise<EvaluationRecord | null>;
  /**
   * Optimistically transitions an evaluation: updates the row only if it is still in `from`, and
   * appends a history event — atomically. Throws ConflictError if the row already moved on.
   */
  transition(input: TransitionInput): Promise<EvaluationRecord>;
  listHistory(evaluationId: string): Promise<EvaluationEventRecord[]>;
  list(params: {
    status?: EvaluationStatus | undefined;
    limit: number;
    cursor: Cursor | null;
  }): Promise<EvaluationRecord[]>;
}

/** Port to the async evaluation pipeline (BullMQ adapter in infrastructure). */
export interface EvaluationJobQueue {
  enqueueAutomatedChecks(evaluationId: string, correlationId?: string | null): Promise<void>;
}
