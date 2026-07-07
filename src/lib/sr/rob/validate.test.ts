import { validateRobJudgementInput } from './validate';

const VALID = {
  studyId: 'study-1',
  domainId: 'randomisation',
  judgement: 'low',
  supportQuote: 'Allocation by a central interactive web system.',
};

describe('validateRobJudgementInput', () => {
  it('accepts a well-formed judgement with a support quote', () => {
    const result = validateRobJudgementInput(VALID, 'rob2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.judgement).toBe('low');
      expect(result.value.supportQuote).toBe(
        'Allocation by a central interactive web system.',
      );
    }
  });

  it('trims the support quote', () => {
    const result = validateRobJudgementInput(
      { ...VALID, supportQuote: '  central randomisation  ' },
      'rob2',
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.supportQuote).toBe('central randomisation');
  });

  it('REQUIRES a support quote — an empty one is refused', () => {
    const result = validateRobJudgementInput(
      { ...VALID, supportQuote: '' },
      'rob2',
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toMatch(/support-for-judgement quote/i);
  });

  it('refuses a whitespace-only support quote', () => {
    const result = validateRobJudgementInput(
      { ...VALID, supportQuote: '   ' },
      'rob2',
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a missing support quote', () => {
    const result = validateRobJudgementInput(
      { studyId: 'study-1', domainId: 'randomisation', judgement: 'low' },
      'rob2',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid judgement value', () => {
    const result = validateRobJudgementInput(
      { ...VALID, judgement: 'some_concerns' },
      'rob2',
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toMatch(/Low, Some concerns, or High/);
  });

  it('rejects a domain from the wrong instrument', () => {
    // `confounding` is ROBINS-I; not valid under RoB 2.
    const result = validateRobJudgementInput(
      { ...VALID, domainId: 'confounding' },
      'rob2',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not a domain/i);
  });

  it('accepts a ROBINS-I domain under ROBINS-I', () => {
    const result = validateRobJudgementInput(
      { ...VALID, domainId: 'confounding' },
      'robins_i',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a missing study or domain', () => {
    expect(
      validateRobJudgementInput({ ...VALID, studyId: '' }, 'rob2').ok,
    ).toBe(false);
    expect(
      validateRobJudgementInput({ ...VALID, domainId: '' }, 'rob2').ok,
    ).toBe(false);
  });

  it('rejects an over-long support quote', () => {
    const result = validateRobJudgementInput(
      { ...VALID, supportQuote: 'x'.repeat(2001) },
      'rob2',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too long/i);
  });
});
