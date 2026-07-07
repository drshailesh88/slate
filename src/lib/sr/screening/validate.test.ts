import { describe, expect, it } from 'vitest';
import { validateCastInput } from './validate';

describe('validateCastInput', () => {
  it('accepts a plain include', () => {
    const result = validateCastInput({ studyId: 'st-1', decision: 'include' });
    expect(result).toEqual({
      ok: true,
      value: {
        studyId: 'st-1',
        decision: 'include',
        excludeReasonCode: null,
        excludeReasonDetail: null,
      },
    });
  });

  it('rejects a missing study', () => {
    expect(validateCastInput({ studyId: '', decision: 'include' }).ok).toBe(
      false,
    );
  });

  it('rejects an unknown decision', () => {
    expect(validateCastInput({ studyId: 'st-1', decision: 'approve' }).ok).toBe(
      false,
    );
  });

  it('strips any reason from a non-exclude decision', () => {
    const result = validateCastInput({
      studyId: 'st-1',
      decision: 'maybe',
      excludeReasonCode: 'wrong_population',
      excludeReasonDetail: 'should be dropped',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { excludeReasonCode: null, excludeReasonDetail: null },
    });
  });

  it('accepts an exclude with a valid preset reason + note', () => {
    const result = validateCastInput({
      studyId: 'st-1',
      decision: 'exclude',
      excludeReasonCode: 'wrong_population',
      excludeReasonDetail: '  paediatric cohort  ',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        decision: 'exclude',
        excludeReasonCode: 'wrong_population',
        excludeReasonDetail: 'paediatric cohort',
      },
    });
  });

  it('rejects an exclude with a bogus reason code', () => {
    expect(
      validateCastInput({
        studyId: 'st-1',
        decision: 'exclude',
        excludeReasonCode: 'made_up',
      }).ok,
    ).toBe(false);
  });

  it('allows an exclude with no reason (reason is optional)', () => {
    const result = validateCastInput({ studyId: 'st-1', decision: 'exclude' });
    expect(result).toMatchObject({
      ok: true,
      value: {
        decision: 'exclude',
        excludeReasonCode: null,
        excludeReasonDetail: null,
      },
    });
  });

  it('caps an over-long note', () => {
    const long = 'x'.repeat(5000);
    const result = validateCastInput({
      studyId: 'st-1',
      decision: 'exclude',
      excludeReasonDetail: long,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.excludeReasonDetail?.length).toBe(2000);
    }
  });
});
