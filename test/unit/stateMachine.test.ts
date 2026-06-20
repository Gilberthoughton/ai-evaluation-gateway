import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  isTerminal,
  TERMINAL_STATUSES,
} from '../../src/domain/evaluation/stateMachine.js';
import { ConflictError } from '../../src/domain/errors.js';

describe('evaluation state machine', () => {
  it('allows the happy-path automated transitions', () => {
    expect(canTransition('PENDING', 'RUNNING_CHECKS')).toBe(true);
    expect(canTransition('RUNNING_CHECKS', 'AWAITING_REVIEW')).toBe(true);
    expect(canTransition('AWAITING_REVIEW', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'SCORED')).toBe(true);
    expect(canTransition('SCORED', 'FINALIZED')).toBe(true);
  });

  it('forbids skipping states', () => {
    expect(canTransition('PENDING', 'SCORED')).toBe(false);
    expect(canTransition('PENDING', 'AWAITING_REVIEW')).toBe(false);
    expect(canTransition('AWAITING_REVIEW', 'FINALIZED')).toBe(false);
  });

  it('treats FINALIZED, FAILED, and CANCELLED as terminal', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(canTransition(status, 'PENDING')).toBe(false);
    }
  });

  it('assertTransition throws a ConflictError on an illegal transition', () => {
    expect(() => assertTransition('FINALIZED', 'UNDER_REVIEW')).toThrow(ConflictError);
    expect(() => assertTransition('PENDING', 'RUNNING_CHECKS')).not.toThrow();
  });
});
