import {
  isDomainOfInstrument,
  isRobJudgement,
  type RobInstrument,
  type RobJudgement,
} from './domains';

// ─────────────────────────────────────────────────────────────────────────────
// Input validation for a RoB domain judgement — the trust boundary the server
// action calls before any write. Deny-by-default: every field is checked and a
// bad one returns an actionable message (never a thrown stack trace to the user).
//
// The support-for-judgement quote is REQUIRED: a RoB judgement without its
// evidence is not a defensible appraisal (Cochrane — every domain judgement is
// justified from the study text). A blank/whitespace quote is refused.
// ─────────────────────────────────────────────────────────────────────────────

// A generous cap so a pasted methods passage fits, but not unbounded input.
const SUPPORT_QUOTE_MAX = 2000;

export interface RawRobJudgementInput {
  studyId?: unknown;
  domainId?: unknown;
  judgement?: unknown;
  supportQuote?: unknown;
}

export interface CleanRobJudgement {
  studyId: string;
  domainId: string;
  judgement: RobJudgement;
  supportQuote: string;
}

export type ValidateResult =
  { ok: true; value: CleanRobJudgement } | { ok: false; message: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Validate a cast against the study's instrument. The instrument is resolved
// server-side (from `studies.rob_instrument`) and passed in — never trusted from
// the client — so a client cannot smuggle a domain from the wrong instrument.
export function validateRobJudgementInput(
  input: RawRobJudgementInput,
  instrument: RobInstrument,
): ValidateResult {
  if (!isNonEmptyString(input.studyId)) {
    return { ok: false, message: 'A study is required for a RoB judgement.' };
  }
  if (!isNonEmptyString(input.domainId)) {
    return { ok: false, message: 'A domain is required for a RoB judgement.' };
  }
  if (!isDomainOfInstrument(instrument, input.domainId)) {
    return {
      ok: false,
      message: `"${input.domainId}" is not a domain of this study's instrument.`,
    };
  }
  if (typeof input.judgement !== 'string' || !isRobJudgement(input.judgement)) {
    return {
      ok: false,
      message: 'Choose a judgement: Low, Some concerns, or High.',
    };
  }
  if (!isNonEmptyString(input.supportQuote)) {
    return {
      ok: false,
      message:
        'A support-for-judgement quote is required — cite the evidence for this judgement.',
    };
  }
  const supportQuote = input.supportQuote.trim();
  if (supportQuote.length > SUPPORT_QUOTE_MAX) {
    return {
      ok: false,
      message: `The support quote is too long (max ${SUPPORT_QUOTE_MAX} characters).`,
    };
  }

  return {
    ok: true,
    value: {
      studyId: input.studyId,
      domainId: input.domainId,
      judgement: input.judgement,
      supportQuote,
    },
  };
}
