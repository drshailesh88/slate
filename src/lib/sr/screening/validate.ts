import { isExcludeReasonCode } from './exclude-reasons';
import { isDecisionKind } from './queue';
import type { ScreeningDecisionKind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Sanitize the untrusted cast payload at the server-action boundary (PURE, so it
// is unit-testable without the DB). Never trusts the client: an unknown decision
// or a bogus exclusion reason is rejected with an actionable message, and a
// non-exclude decision can never carry an exclusion reason.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DETAIL_LENGTH = 2000;

export interface RawCastInput {
  studyId: unknown;
  decision: unknown;
  excludeReasonCode?: unknown;
  excludeReasonDetail?: unknown;
}

export interface CleanCastInput {
  studyId: string;
  decision: ScreeningDecisionKind;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
}

export type CastValidation =
  | { ok: true; value: CleanCastInput }
  | { ok: false; message: string };

export function validateCastInput(raw: RawCastInput): CastValidation {
  if (typeof raw.studyId !== 'string' || raw.studyId.length === 0) {
    return { ok: false, message: 'Missing the study to screen.' };
  }
  if (typeof raw.decision !== 'string' || !isDecisionKind(raw.decision)) {
    return { ok: false, message: 'Choose Include, Maybe, or Exclude.' };
  }
  const decision = raw.decision;

  // Only an exclusion carries a reason; a non-exclude decision drops any reason
  // a tampered client might have attached.
  if (decision !== 'exclude') {
    return {
      ok: true,
      value: {
        studyId: raw.studyId,
        decision,
        excludeReasonCode: null,
        excludeReasonDetail: null,
      },
    };
  }

  let excludeReasonCode: string | null = null;
  if (raw.excludeReasonCode != null && raw.excludeReasonCode !== '') {
    if (
      typeof raw.excludeReasonCode !== 'string' ||
      !isExcludeReasonCode(raw.excludeReasonCode)
    ) {
      return { ok: false, message: 'Choose a valid exclusion reason.' };
    }
    excludeReasonCode = raw.excludeReasonCode;
  }

  let excludeReasonDetail: string | null = null;
  if (raw.excludeReasonDetail != null && raw.excludeReasonDetail !== '') {
    if (typeof raw.excludeReasonDetail !== 'string') {
      return { ok: false, message: 'The exclusion note is not valid text.' };
    }
    const trimmed = raw.excludeReasonDetail.trim().slice(0, MAX_DETAIL_LENGTH);
    excludeReasonDetail = trimmed.length > 0 ? trimmed : null;
  }

  return {
    ok: true,
    value: { studyId: raw.studyId, decision, excludeReasonCode, excludeReasonDetail },
  };
}
