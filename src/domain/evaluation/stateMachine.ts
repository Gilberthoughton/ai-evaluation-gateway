import { ConflictError } from '../errors.js';

export const EVALUATION_STATUSES = [
  'PENDING',
  'RUNNING_CHECKS',
  'AWAITING_REVIEW',
  'UNDER_REVIEW',
  'SCORED',
  'FINALIZED',
  'FAILED',
  'CANCELLED',
] as const;

export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

const TRANSITIONS: Record<EvaluationStatus, readonly EvaluationStatus[]> = {
  PENDING: ['RUNNING_CHECKS', 'CANCELLED'],
  RUNNING_CHECKS: ['AWAITING_REVIEW', 'FAILED'],
  AWAITING_REVIEW: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['SCORED', 'CANCELLED'],
  SCORED: ['FINALIZED', 'UNDER_REVIEW'],
  FINALIZED: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly EvaluationStatus[] = ['FINALIZED', 'FAILED', 'CANCELLED'];

export function canTransition(from: EvaluationStatus, to: EvaluationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: EvaluationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Throws a 409 Conflict if the transition is not permitted by the lifecycle. */
export function assertTransition(from: EvaluationStatus, to: EvaluationStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Illegal evaluation transition: ${from} -> ${to}`);
  }
}
