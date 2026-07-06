import type { AcceptRejectReason } from './invitation-policy';

// ─────────────────────────────────────────────────────────────────────────────
// Typed errors for member/invitation actions. Each carries the HTTP status a
// route boundary should return, and an actionable message (coding-style: what
// happened, why, what to do). They are distinct from the authz-spine errors
// (SrAuthzError) — those gate REVIEW access (deny → 404); these gate MEMBER
// MANAGEMENT actions the caller is otherwise allowed to see.
// ─────────────────────────────────────────────────────────────────────────────

export type MemberActionErrorCode =
  | 'owner_action_required'
  | 'invite_rate_limited'
  | 'invalid_email'
  | 'last_owner'
  | 'already_member'
  | 'no_account'
  | 'member_not_found'
  | 'invitation_invalid'
  | 'ai_validation_required';

export class MemberActionError extends Error {
  readonly code: MemberActionErrorCode;
  readonly status: number;

  constructor(code: MemberActionErrorCode, status: number, message: string) {
    super(message);
    this.name = 'MemberActionError';
    this.code = code;
    this.status = status;
  }
}

// 403 — a non-owner attempted an owner-only action (invite, change role, revoke,
// AI activate). The caller is a member (they can see the team), so this is a
// genuine 403, not a 404 existence-hiding case.
export class OwnerActionRequiredError extends MemberActionError {
  constructor(message = 'Only the review owner can manage members.') {
    super('owner_action_required', 403, message);
    this.name = 'OwnerActionRequiredError';
  }
}

// 429 — too many invitations created for this review in the rate window.
export class InviteRateLimitError extends MemberActionError {
  constructor(
    message = 'Too many invitations sent recently. Wait a little while before inviting more people.',
  ) {
    super('invite_rate_limited', 429, message);
    this.name = 'InviteRateLimitError';
  }
}

// 400 — the invited email is malformed.
export class InvalidEmailError extends MemberActionError {
  constructor(message = 'Enter a valid email address.') {
    super('invalid_email', 400, message);
    this.name = 'InvalidEmailError';
  }
}

// 409 — refuses to demote or revoke the last remaining owner, which would orphan
// the review (no one could manage it).
export class LastOwnerError extends MemberActionError {
  constructor(
    message = 'A review must keep at least one owner. Assign another owner first.',
  ) {
    super('last_owner', 409, message);
    this.name = 'LastOwnerError';
  }
}

// 409 — the user is already an active member (add-existing).
export class AlreadyMemberError extends MemberActionError {
  constructor(message = 'That person is already a member of this review.') {
    super('already_member', 409, message);
    this.name = 'AlreadyMemberError';
  }
}

// 404 — add-existing found no account for the email. Direct the owner to send an
// email invitation (which provisions the account on accept) instead.
export class NoAccountError extends MemberActionError {
  constructor(
    message = 'No existing account for that email. Send an email invitation instead.',
  ) {
    super('no_account', 404, message);
    this.name = 'NoAccountError';
  }
}

// 404 — the targeted member row does not exist on this review.
export class MemberNotFoundError extends MemberActionError {
  constructor(message = 'That member is not on this review.') {
    super('member_not_found', 404, message);
    this.name = 'MemberNotFoundError';
  }
}

// 404/410 — an invite could not be accepted. `not_found` is a 404 (generic, no
// existence leak); every other reason is a 410 Gone (the holder proved token
// possession, so the specific reason is safe to state).
export class InvitationInvalidError extends MemberActionError {
  readonly reason: AcceptRejectReason;

  constructor(reason: AcceptRejectReason, message: string) {
    super('invitation_invalid', reason === 'not_found' ? 404 : 410, message);
    this.name = 'InvitationInvalidError';
    this.reason = reason;
  }
}

// 422 — the AI reviewer cannot be activated until it passes recall validation.
// The validation flow itself lands in M3 (T14); this guard makes "AI never
// screens unvalidated" true from day one.
export class AiValidationRequiredError extends MemberActionError {
  constructor(
    message = 'The AI reviewer must pass recall validation before it can be activated.',
  ) {
    super('ai_validation_required', 422, message);
    this.name = 'AiValidationRequiredError';
  }
}

export function isMemberActionError(
  error: unknown,
): error is MemberActionError {
  return error instanceof MemberActionError;
}
