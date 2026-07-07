import { describe, expect, it } from 'vitest';
import { isQcSampled, normalizeRate, selectQcSample } from './qc';

describe('QC sampling — deterministic (non-neg #9)', () => {
  it('normalizeRate clamps to [0,1]', () => {
    expect(normalizeRate(-1)).toBe(0);
    expect(normalizeRate(0)).toBe(0);
    expect(normalizeRate(0.2)).toBe(0.2);
    expect(normalizeRate(2)).toBe(1);
    expect(normalizeRate(Number.NaN)).toBe(0);
  });

  it('rate 0 samples nothing; rate 1 samples everything', () => {
    const c = { studyId: 's', fieldId: 'f' };
    expect(isQcSampled(c, 0)).toBe(false);
    expect(isQcSampled(c, 1)).toBe(true);
  });

  it('is deterministic — same input, same answer every call', () => {
    const c = { studyId: 'st1', fieldId: 'effect_estimate' };
    const first = isQcSampled(c, 0.2);
    for (let i = 0; i < 20; i += 1) {
      expect(isQcSampled(c, 0.2)).toBe(first);
    }
  });

  it('samples roughly the configured fraction across many fields', () => {
    const candidates = Array.from({ length: 400 }, (_, i) => ({
      studyId: `st${i}`,
      fieldId: 'effect_estimate',
    }));
    const sampled = selectQcSample(candidates, 0.2).length;
    // ~20% of 400 = 80, allow a generous band for a hash distribution.
    expect(sampled).toBeGreaterThan(40);
    expect(sampled).toBeLessThan(130);
  });
});
