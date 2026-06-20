import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EvaluationService } from '../../src/application/evaluations/evaluationService.js';
import type {
  CreateEvaluationInput,
  EvaluationEventRecord,
  EvaluationJobQueue,
  EvaluationRecord,
  EvaluationRepository,
  TransitionInput,
} from '../../src/application/evaluations/ports.js';
import type { SubmissionRecord, SubmissionRepository } from '../../src/application/prompts/ports.js';
import type { RubricRepository, RubricVersionRecord } from '../../src/application/rubrics/ports.js';
import { ConflictError, NotFoundError } from '../../src/domain/errors.js';

class FakeEvaluationRepository implements EvaluationRepository {
  evaluations = new Map<string, EvaluationRecord>();
  events: (EvaluationEventRecord & { evaluationId: string })[] = [];
  private seq = 0;

  create(input: CreateEvaluationInput): Promise<EvaluationRecord> {
    const now = new Date();
    const record: EvaluationRecord = {
      id: randomUUID(),
      submissionId: input.submissionId,
      rubricVersionId: input.rubricVersionId,
      status: 'PENDING',
      assigneeId: null,
      automatedResults: null,
      createdAt: now,
      updatedAt: now,
    };
    this.evaluations.set(record.id, record);
    this.push(record.id, null, 'PENDING', input.actorId);
    return Promise.resolve(record);
  }
  findById(id: string): Promise<EvaluationRecord | null> {
    return Promise.resolve(this.evaluations.get(id) ?? null);
  }
  transition(input: TransitionInput): Promise<EvaluationRecord> {
    const record = this.evaluations.get(input.evaluationId);
    if (!record || record.status !== input.from) {
      throw new ConflictError(`not in state ${input.from}`);
    }
    record.status = input.to;
    record.updatedAt = new Date();
    if (input.automatedResults !== undefined) record.automatedResults = input.automatedResults;
    this.push(input.evaluationId, input.from, input.to, input.actorId);
    return Promise.resolve(record);
  }
  listHistory(evaluationId: string): Promise<EvaluationEventRecord[]> {
    return Promise.resolve(this.events.filter((e) => e.evaluationId === evaluationId));
  }
  list(): Promise<EvaluationRecord[]> {
    return Promise.resolve([...this.evaluations.values()]);
  }
  private push(
    evaluationId: string,
    from: EvaluationRecord['status'] | null,
    to: EvaluationRecord['status'],
    actorId: string | null,
  ) {
    this.events.push({
      id: ++this.seq,
      evaluationId,
      fromStatus: from,
      toStatus: to,
      reason: null,
      actorId,
      occurredAt: new Date(),
    });
  }
}

const submission: SubmissionRecord = {
  id: 'sub-1',
  promptId: 'p-1',
  modelName: 'm',
  modelVersion: null,
  output: 'def solve(): return 42',
  metadata: {},
  submittedBy: 'u-1',
  createdAt: new Date(),
};

const submissions: SubmissionRepository = {
  findById: (id) => Promise.resolve(id === submission.id ? submission : null),
  create: () => Promise.reject(new Error('unused')),
  listByPrompt: () => Promise.resolve([]),
};

const rubricVersion: RubricVersionRecord = {
  id: 'rv-1',
  rubricId: 'r-1',
  version: 1,
  publishedAt: new Date(),
  criteria: [],
};

const rubrics: RubricRepository = {
  findLatestVersion: (rubricId) => Promise.resolve(rubricId === 'r-1' ? rubricVersion : null),
  create: () => Promise.reject(new Error('unused')),
  publishVersion: () => Promise.reject(new Error('unused')),
  findById: () => Promise.resolve(null),
  list: () => Promise.resolve([]),
};

describe('EvaluationService', () => {
  let repo: FakeEvaluationRepository;
  let queue: EvaluationJobQueue & { enqueued: string[] };
  let service: EvaluationService;

  beforeEach(() => {
    repo = new FakeEvaluationRepository();
    queue = {
      enqueued: [],
      enqueueAutomatedChecks(id) {
        this.enqueued.push(id);
        return Promise.resolve();
      },
    };
    service = new EvaluationService(repo, submissions, rubrics, queue);
  });

  it('starts an evaluation in PENDING and enqueues automated checks', async () => {
    const evaluation = await service.startEvaluation({
      submissionId: 'sub-1',
      rubricId: 'r-1',
      actorId: 'u-1',
      correlationId: 'c-1',
    });
    expect(evaluation.status).toBe('PENDING');
    expect(evaluation.rubricVersionId).toBe('rv-1');
    expect(queue.enqueued).toEqual([evaluation.id]);
  });

  it('404s when the submission or rubric is missing', async () => {
    await expect(
      service.startEvaluation({ submissionId: 'nope', rubricId: 'r-1', actorId: 'u', correlationId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.startEvaluation({ submissionId: 'sub-1', rubricId: 'nope', actorId: 'u', correlationId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('runs automated checks: PENDING -> AWAITING_REVIEW with results and full history', async () => {
    const evaluation = await service.startEvaluation({
      submissionId: 'sub-1',
      rubricId: 'r-1',
      actorId: 'u-1',
      correlationId: 'c-1',
    });

    await service.runAutomatedChecks(evaluation.id, 'c-1');

    const after = await service.getEvaluation(evaluation.id);
    expect(after.status).toBe('AWAITING_REVIEW');
    expect(after.automatedResults).toMatchObject({ looksLikeCode: true, nonEmpty: true });

    const history = await service.listHistory(evaluation.id);
    expect(history.map((h) => h.toStatus)).toEqual(['PENDING', 'RUNNING_CHECKS', 'AWAITING_REVIEW']);
  });

  it('is idempotent: re-running checks on a processed evaluation is a no-op', async () => {
    const evaluation = await service.startEvaluation({
      submissionId: 'sub-1',
      rubricId: 'r-1',
      actorId: 'u-1',
      correlationId: 'c-1',
    });
    await service.runAutomatedChecks(evaluation.id);
    const historyLen = (await service.listHistory(evaluation.id)).length;

    await service.runAutomatedChecks(evaluation.id); // redelivery

    expect((await service.getEvaluation(evaluation.id)).status).toBe('AWAITING_REVIEW');
    expect(await service.listHistory(evaluation.id)).toHaveLength(historyLen);
  });
});
