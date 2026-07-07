import { describe, expect, it } from 'vitest';
import {
  AI_CO_REVIEWER_NOTE,
  BLIND_MODE_NOTE,
  INVITABLE_ROLES,
  REVIEW_MODES,
  REVIEW_ROLES,
  isInvitableRole,
  isReviewMode,
  isReviewType,
} from './review-modes';

// Words that would turn a factual mode/blind description into a scold or a
// rigor comparison. The science requires stating what each mode DOES, never
// grading the user's choice.
const SCOLD =
  /\b(rigor|rigour|rigorous|gold[-\s]?standard|should|must|proper|properly|inferior|superior|weaker|stronger|better|worse|reliable|unreliable|risky|shortcut|compromis)\w*/i;

describe('review mode copy is factual (no scold, no rigor comparison)', () => {
  it('every mode description avoids scold / comparison language', () => {
    for (const mode of REVIEW_MODES) {
      expect(mode.description).not.toMatch(SCOLD);
    }
  });

  it('offers exactly the two supported modes', () => {
    expect(REVIEW_MODES.map((m) => m.value)).toEqual([
      'two_reviewer',
      'ai_co_reviewer',
    ]);
  });

  it('the ai_co_reviewer note is one informational line, no scold', () => {
    expect(AI_CO_REVIEWER_NOTE).not.toMatch(SCOLD);
    // States the safeguard as fact: recall-validated AND blinded like a human.
    expect(AI_CO_REVIEWER_NOTE).toMatch(/recall[-\s]?validated/i);
    expect(AI_CO_REVIEWER_NOTE).toMatch(/blind/i);
  });
});

describe('Blind Mode copy states a locked-on fact', () => {
  it('is the factual independent-screening line, not a toggle prompt', () => {
    expect(BLIND_MODE_NOTE).not.toMatch(SCOLD);
    expect(BLIND_MODE_NOTE.toLowerCase()).toContain('independent');
    expect(BLIND_MODE_NOTE).toMatch(/^on\b/i);
  });
});

describe('role model', () => {
  it('describes all five per-review roles', () => {
    expect(REVIEW_ROLES.map((r) => r.value)).toEqual([
      'owner',
      'collaborator',
      'reviewer',
      'arbitrator',
      'viewer',
    ]);
    for (const role of REVIEW_ROLES) {
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it('never offers owner as an invitable role (the creator is the owner)', () => {
    expect(INVITABLE_ROLES.some((r) => r.value === 'owner')).toBe(false);
    expect(isInvitableRole('owner')).toBe(false);
    expect(isInvitableRole('reviewer')).toBe(true);
  });
});

describe('type guards', () => {
  it('isReviewMode accepts only the two enum values', () => {
    expect(isReviewMode('two_reviewer')).toBe(true);
    expect(isReviewMode('ai_co_reviewer')).toBe(true);
    expect(isReviewMode('solo')).toBe(false);
    expect(isReviewMode(undefined)).toBe(false);
  });

  it('isReviewType accepts a curated type only', () => {
    expect(isReviewType('Intervention review')).toBe(true);
    expect(isReviewType('freeform nonsense')).toBe(false);
  });
});
