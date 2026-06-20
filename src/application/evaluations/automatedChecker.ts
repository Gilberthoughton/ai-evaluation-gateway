export interface AutomatedCheckResult {
  lineCount: number;
  charCount: number;
  nonEmpty: boolean;
  looksLikeCode: boolean;
  checkedAt: string;
}

/**
 * Computes deterministic, static signals about a model output. By design it NEVER executes the
 * submitted code (ADR 0003); it only inspects the text. Real systems would add language-aware static
 * analysis and a sandboxed runner — both out of scope for Phase 1.
 */
export function runStaticChecks(output: string): AutomatedCheckResult {
  const lines = output.split('\n');
  const looksLikeCode = /\b(def|function|class|=>|return|const|let|var|import)\b/.test(output);
  return {
    lineCount: lines.length,
    charCount: output.length,
    nonEmpty: output.trim().length > 0,
    looksLikeCode,
    checkedAt: new Date().toISOString(),
  };
}
