import { describe, expect, it } from 'vitest';
import {
  criticalFieldIds,
  extractionSections,
  fieldDef,
  isExtractionFieldId,
} from './fields';
import {
  EXTRACTION_STATES,
  isExtractionState,
  stateCarriesValue,
  stateLabel,
} from './states';

describe('extraction field template', () => {
  it('has three ordered sections with fields', () => {
    const sections = extractionSections();
    expect(sections.map((s) => s.id)).toEqual([
      'general',
      'characteristics',
      'outcomes',
    ]);
    for (const s of sections) expect(s.fields.length).toBeGreaterThan(0);
  });

  it('marks outcome/effect fields as critical (for QC sampling)', () => {
    const critical = criticalFieldIds();
    expect(critical).toContain('effect_estimate');
    expect(critical).toContain('confidence_interval');
    expect(critical).not.toContain('country');
  });

  it('validates field ids and resolves defs', () => {
    expect(isExtractionFieldId('sample_size')).toBe(true);
    expect(isExtractionFieldId('nonsense')).toBe(false);
    expect(fieldDef('effect_estimate')?.critical).toBe(true);
    expect(fieldDef('nonsense')).toBeNull();
  });
});

describe('the four extraction states', () => {
  it('are exactly reported / not_reported / na / unclear', () => {
    expect([...EXTRACTION_STATES]).toEqual([
      'reported',
      'not_reported',
      'na',
      'unclear',
    ]);
  });

  it('only `reported` carries a value (a blank is never a zero)', () => {
    expect(stateCarriesValue('reported')).toBe(true);
    expect(stateCarriesValue('not_reported')).toBe(false);
    expect(stateCarriesValue('na')).toBe(false);
    expect(stateCarriesValue('unclear')).toBe(false);
  });

  it('labels each state distinctly', () => {
    expect(stateLabel('not_reported')).toBe('Not reported');
    expect(stateLabel('na')).toBe('N/A');
  });

  it('guards unknown states', () => {
    expect(isExtractionState('reported')).toBe(true);
    expect(isExtractionState('zero')).toBe(false);
    expect(isExtractionState(0)).toBe(false);
  });
});
