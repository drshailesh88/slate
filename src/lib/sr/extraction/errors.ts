// Typed extraction errors (T15). Each carries the HTTP status a route boundary
// should return and a human-actionable message. Distinct from SrAuthzError
// (access) and ArbitratorIndependenceError (blinded participation) — these are the
// extraction/reconcile state-machine + validation failures on an already-
// authorized member.

export type ExtractionErrorCode =
  'extraction_forbidden' | 'extraction_wrong_phase' | 'extraction_invalid';

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly status: number;

  constructor(code: ExtractionErrorCode, status: number, message: string) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.status = status;
  }
}

// 403 — an active member without the needed rights (extract / reconcile / unblind).
export class ExtractionForbiddenError extends ExtractionError {
  constructor(
    message = 'You do not have permission to do that on this extraction.',
  ) {
    super('extraction_forbidden', 403, message);
    this.name = 'ExtractionForbiddenError';
  }
}

// 409 — an action was attempted in the wrong phase. Extraction writes only during
// `independent`; reconciliation only during `reconcile`.
export class ExtractionWrongPhaseError extends ExtractionError {
  constructor(
    message = 'This action is not available in the current extraction phase.',
  ) {
    super('extraction_wrong_phase', 409, message);
    this.name = 'ExtractionWrongPhaseError';
  }
}

// 422 — the payload is not a valid extraction/reconciliation. A `reported` field
// with no value, a non-reported state carrying a value, an arbitration without an
// arbitrator, or parking a field with no recorded rationale would all be invalid.
export class ExtractionInvalidError extends ExtractionError {
  constructor(message = 'That extraction value is not valid.') {
    super('extraction_invalid', 422, message);
    this.name = 'ExtractionInvalidError';
  }
}

export function isExtractionError(error: unknown): error is ExtractionError {
  return error instanceof ExtractionError;
}
