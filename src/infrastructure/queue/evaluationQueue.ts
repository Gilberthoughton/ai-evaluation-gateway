import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { EvaluationJobQueue } from '../../application/evaluations/ports.js';

export const EVALUATION_AUTOMATED_QUEUE = 'evaluation.automated';

export interface AutomatedCheckJob {
  evaluationId: string;
  correlationId: string | null;
}

export interface EvaluationQueue {
  adapter: EvaluationJobQueue;
  close(): Promise<void>;
}

/**
 * BullMQ-backed evaluation queue. Enqueues are idempotent via a deterministic jobId, retried with
 * exponential backoff, and dead-lettered (kept on failure) for operator visibility (ADR 0003).
 */
export function createEvaluationQueue(connection: Redis): EvaluationQueue {
  const queue = new Queue<AutomatedCheckJob, void, string>(EVALUATION_AUTOMATED_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  });

  const adapter: EvaluationJobQueue = {
    enqueueAutomatedChecks: async (evaluationId, correlationId = null) => {
      await queue.add(
        'automated',
        { evaluationId, correlationId },
        { jobId: `eval:${evaluationId}:automated` },
      );
    },
  };

  return { adapter, close: () => queue.close() };
}
