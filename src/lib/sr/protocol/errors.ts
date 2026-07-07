// Typed protocol errors. Each carries the HTTP status a route boundary should
// return and a human-actionable message (what happened + what to do next). The
// service throws these; the server actions surface `.message` to the client and
// map `.status` at the boundary. They are distinct from SrAuthzError (access) —
// these are state-machine / validation failures on an already-authorized member.

export type ProtocolErrorCode =
  | 'protocol_locked'
  | 'protocol_already_locked'
  | 'protocol_not_locked'
  | 'amendment_reason_required'
  | 'protocol_incomplete'
  | 'protocol_forbidden';

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly status: number;

  constructor(code: ProtocolErrorCode, status: number, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    this.status = status;
  }
}

// 409 — a draft save was attempted on a locked protocol. Locked protocols only
// change through dated amendments, never silent overwrites.
export class ProtocolLockedError extends ProtocolError {
  constructor(
    message = 'This protocol is locked. Edits to a locked protocol must be made as a dated amendment with a reason, not saved over the draft.',
  ) {
    super('protocol_locked', 409, message);
    this.name = 'ProtocolLockedError';
  }
}

// 409 — lock was attempted on a protocol that is already locked.
export class ProtocolAlreadyLockedError extends ProtocolError {
  constructor(
    message = 'This protocol is already locked. Use a dated amendment to change it.',
  ) {
    super('protocol_already_locked', 409, message);
    this.name = 'ProtocolAlreadyLockedError';
  }
}

// 409 — an amendment was attempted before the protocol was ever locked. Amend
// only applies to a locked protocol; before that, edit and save the draft.
export class ProtocolNotLockedError extends ProtocolError {
  constructor(
    message = 'This protocol is not locked yet. Lock it first — amendments only apply to a locked protocol.',
  ) {
    super('protocol_not_locked', 409, message);
    this.name = 'ProtocolNotLockedError';
  }
}

// 422 — an amendment was submitted without a reason. The reason is the audit
// trail; an amendment without one is never accepted.
export class AmendmentReasonRequiredError extends ProtocolError {
  constructor(
    message = 'An amendment to a locked protocol requires a reason — it is recorded in the dated amendment history.',
  ) {
    super('amendment_reason_required', 422, message);
    this.name = 'AmendmentReasonRequiredError';
  }
}

// 422 — a lock or amendment was attempted with no eligibility criteria. A
// protocol with nothing to screen against cannot be locked.
export class ProtocolIncompleteError extends ProtocolError {
  constructor(
    message = 'Add at least one eligibility criterion before locking the protocol.',
  ) {
    super('protocol_incomplete', 422, message);
    this.name = 'ProtocolIncompleteError';
  }
}

// 403 — an active member without protocol-edit rights attempted a write. Only
// owners and collaborators edit, lock, or amend the protocol.
export class ProtocolForbiddenError extends ProtocolError {
  constructor(
    message = 'You do not have permission to edit this protocol. Only the review owner and collaborators can change it.',
  ) {
    super('protocol_forbidden', 403, message);
    this.name = 'ProtocolForbiddenError';
  }
}

export function isProtocolError(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError;
}
