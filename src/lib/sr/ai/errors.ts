// ─────────────────────────────────────────────────────────────────────────────
// Typed errors for the AI screening reviewer. Each carries the HTTP status a
// route boundary should return and an actionable message (what happened, why,
// what to do). The recall-validation GATE surfaces as a throw — a denied cast is
// never confused with an empty result.
// ─────────────────────────────────────────────────────────────────────────────

export type AiReviewerErrorCode =
  | 'ai_not_validated'
  | 'ai_validation_no_includes'
  | 'ai_validation_empty_sample';

export class AiReviewerError extends Error {
  readonly code: AiReviewerErrorCode;
  readonly status: number;

  constructor(code: AiReviewerErrorCode, status: number, message: string) {
    super(message);
    this.name = 'AiReviewerError';
    this.code = code;
    this.status = status;
  }
}

// 422 — the AI tried to cast a screening decision without a passing recall
// validation on record. This is THE gate (FOUNDATION §8): no passed=true
// ai_validations row → the AI cannot screen.
export class AiNotValidatedError extends AiReviewerError {
  constructor(
    message = 'The AI reviewer must pass recall validation (recall ≥ target on the includes) before it can screen. Run validation from the Team screen first.',
  ) {
    super('ai_not_validated', 422, message);
    this.name = 'AiNotValidatedError';
  }
}

// 422 — a recall validation was requested but the labelled sample has no human
// includes, so recall/sensitivity on includes is undefined and cannot pass.
export class AiValidationNoIncludesError extends AiReviewerError {
  constructor(
    message = 'Recall validation needs at least one human-labelled include in the sample — recall on includes is undefined otherwise. Add includes to the validation sample.',
  ) {
    super('ai_validation_no_includes', 422, message);
    this.name = 'AiValidationNoIncludesError';
  }
}

// 422 — a recall validation was requested with an empty labelled sample.
export class AiValidationEmptySampleError extends AiReviewerError {
  constructor(
    message = 'Recall validation needs a human-labelled sample from this review. No labelled records were provided.',
  ) {
    super('ai_validation_empty_sample', 422, message);
    this.name = 'AiValidationEmptySampleError';
  }
}

export function isAiReviewerError(error: unknown): error is AiReviewerError {
  return error instanceof AiReviewerError;
}
