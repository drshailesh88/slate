import { describe, expect, it } from 'vitest';
import { sanitizeProtocolContent, sanitizeReason } from './validate';

// The boundary sanitizer never trusts the client payload — it coerces to a
// well-formed ProtocolContent, drops empty rows, and normalizes the enums.

describe('sanitizeProtocolContent', () => {
  it('coerces a well-formed payload and keeps valid criteria', () => {
    const content = sanitizeProtocolContent({
      researchQuestion: 'Q',
      pico: {
        population: 'P',
        intervention: 'I',
        comparator: 'C',
        outcome: 'O',
        studyDesign: 'D',
      },
      criteria: [
        {
          id: 'a',
          kind: 'exclude',
          label: 'Animal studies',
          instruction: 'Exclude non-human studies.',
          answerStructure: 'yes_no_maybe',
        },
      ],
    });

    expect(content.researchQuestion).toBe('Q');
    expect(content.pico.population).toBe('P');
    expect(content.criteria).toHaveLength(1);
    expect(content.criteria[0].kind).toBe('exclude');
  });

  it('drops criteria with an empty label (empty rows are noise)', () => {
    const content = sanitizeProtocolContent({
      criteria: [
        { id: '1', kind: 'include', label: '  ', instruction: 'x' },
        { id: '2', kind: 'include', label: 'Real', instruction: 'y' },
      ],
    });
    expect(content.criteria.map((c) => c.label)).toEqual(['Real']);
  });

  it('defaults an unknown kind to include and an unknown answer structure', () => {
    const content = sanitizeProtocolContent({
      criteria: [
        { id: '1', label: 'X', kind: 'weird', answerStructure: 'bogus' },
      ],
    });
    expect(content.criteria[0].kind).toBe('include');
    expect(content.criteria[0].answerStructure).toBe('yes_no_maybe');
  });

  it('assigns a fallback id when the criterion id is missing', () => {
    const content = sanitizeProtocolContent({
      criteria: [{ label: 'No id here' }],
    });
    expect(content.criteria[0].id).toBe('crit-0');
  });

  it('returns a blank protocol for garbage input', () => {
    const content = sanitizeProtocolContent(null);
    expect(content.researchQuestion).toBe('');
    expect(content.criteria).toEqual([]);
    expect(Object.keys(content.pico)).toHaveLength(5);
  });

  it('ignores non-array criteria', () => {
    const content = sanitizeProtocolContent({ criteria: 'not-an-array' });
    expect(content.criteria).toEqual([]);
  });

  it('caps oversized strings', () => {
    const huge = 'x'.repeat(10_000);
    const content = sanitizeProtocolContent({ researchQuestion: huge });
    expect(content.researchQuestion.length).toBe(4000);
  });
});

describe('sanitizeReason', () => {
  it('trims and coerces the reason', () => {
    expect(sanitizeReason('  widened scope  ')).toBe('widened scope');
    expect(sanitizeReason(42)).toBe('');
    expect(sanitizeReason(undefined)).toBe('');
  });
});
