// Typed authorization errors for the Systematic-Review module.
//
// Deny-by-default: every failure to resolve access surfaces as one of these,
// each carrying the HTTP status a route boundary should return. A non-member
// and a nonexistent review are INDISTINGUISHABLE — both raise ReviewAccessError
// (404), never leaking whether the review exists.

export type SrAuthzErrorCode =
  'review_access_denied' | 'org_scope_mismatch' | 'arbitrator_not_independent';

export class SrAuthzError extends Error {
  readonly code: SrAuthzErrorCode;
  readonly status: number;

  constructor(code: SrAuthzErrorCode, status: number, message: string) {
    super(message);
    this.name = 'SrAuthzError';
    this.code = code;
    this.status = status;
  }
}

// 404 — the caller is not an active member of this review, OR the review /
// study does not exist. The two cases are deliberately identical so existence
// is never leaked (IDOR kill, FOUNDATION-auth-tenancy.md §5).
export class ReviewAccessError extends SrAuthzError {
  constructor(message = 'Review not found.') {
    super('review_access_denied', 404, message);
    this.name = 'ReviewAccessError';
  }
}

// 403 — the actor's active WorkOS organization does not own this review, so an
// org-admin action is refused (FOUNDATION-auth-tenancy.md §5). Membership
// actions are org-independent and never raise this.
export class OrgScopeError extends SrAuthzError {
  constructor(message = 'Your active organization does not own this review.') {
    super('org_scope_mismatch', 403, message);
    this.name = 'OrgScopeError';
  }
}

// 422 — arbitrator independence violation: the tool refuses to make a user the
// arbitrator of a study they themselves screened / extracted / appraised
// (FOUNDATION-auth-tenancy.md §5, non-negotiable #7).
export class ArbitratorIndependenceError extends SrAuthzError {
  constructor(
    message = 'This user screened, extracted, or appraised this study and cannot arbitrate it. Assign a reviewer who has not worked on this study.',
  ) {
    super('arbitrator_not_independent', 422, message);
    this.name = 'ArbitratorIndependenceError';
  }
}

export function isSrAuthzError(error: unknown): error is SrAuthzError {
  return error instanceof SrAuthzError;
}
