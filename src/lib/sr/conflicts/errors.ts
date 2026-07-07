// Typed conflict-adjudication errors (T13). Each carries the HTTP status a route
// boundary should return and a human-actionable message. Distinct from
// SrAuthzError (access) and ArbitratorIndependenceError (which lives in the authz
// layer because it touches blinded participation) — these are the resolution
// state-machine / validation failures on an already-authorized member.

export type ConflictErrorCode =
  | 'conflict_forbidden'
  | 'conflict_not_in_reconcile'
  | 'conflict_resolution_invalid';

export class ConflictError extends Error {
  readonly code: ConflictErrorCode;
  readonly status: number;

  constructor(code: ConflictErrorCode, status: number, message: string) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
    this.status = status;
  }
}

// 403 — an active member without adjudication rights attempted a resolution.
export class ConflictForbiddenError extends ConflictError {
  constructor(
    message = 'You do not have permission to resolve conflicts in this review. Only reviewers, collaborators, arbitrators, and the owner can reconcile.',
  ) {
    super('conflict_forbidden', 403, message);
    this.name = 'ConflictForbiddenError';
  }
}

// 409 — a resolution was attempted while screening is still `independent`.
// Conflicts only exist — and can only be resolved — after the owner unblinds.
export class ConflictNotInReconcileError extends ConflictError {
  constructor(
    message = 'Screening is still blinded. Conflicts can only be resolved after the owner reveals decisions for reconciliation.',
  ) {
    super('conflict_not_in_reconcile', 409, message);
    this.name = 'ConflictNotInReconcileError';
  }
}

// 422 — the resolution is not a valid explicit human choice. `align_on_one`
// without an include/exclude pick, or `send_to_arbitrator` without an
// arbitrator, would be an auto/empty resolve — refused. There is no majority /
// auto-vote path anywhere.
export class ConflictResolutionInvalidError extends ConflictError {
  constructor(
    message = 'A conflict is only resolved by an explicit human choice: pick include or exclude, or send it to an independent arbitrator.',
  ) {
    super('conflict_resolution_invalid', 422, message);
    this.name = 'ConflictResolutionInvalidError';
  }
}

export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}
