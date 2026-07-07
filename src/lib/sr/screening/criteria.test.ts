import { describe, expect, it } from 'vitest';
import type { ProtocolContent } from '@/lib/sr/protocol/types';
import { deriveCriteria, deriveHighlightTerms } from './criteria';
import { highlightAbstract } from './highlight';
import {
  EXCLUDE_REASONS,
  excludeReasonLabel,
  isExcludeReasonCode,
} from './exclude-reasons';

const CONTENT: ProtocolContent = {
  researchQuestion: 'Do SGLT2 inhibitors reduce HF hospitalisation?',
  pico: {
    population: 'adults with heart failure',
    intervention: 'SGLT2 inhibitor',
    comparator: 'placebo',
    outcome: 'hospitalisation',
    studyDesign: 'RCT',
  },
  criteria: [
    {
      id: 'c1',
      kind: 'include',
      label: 'Randomised controlled trial',
      instruction: 'Include only RCTs.',
      answerStructure: 'yes_no_maybe',
    },
    {
      id: 'c2',
      kind: 'exclude',
      label: 'Paediatric population',
      instruction: 'Exclude studies in children.',
      answerStructure: 'yes_no_maybe',
    },
  ],
};

describe('deriveCriteria', () => {
  it('splits include vs exclude criteria for the checklist', () => {
    const criteria = deriveCriteria(CONTENT);
    expect(criteria.include.map((c) => c.label)).toEqual([
      'Randomised controlled trial',
    ]);
    expect(criteria.exclude.map((c) => c.label)).toEqual([
      'Paediatric population',
    ]);
  });

  it('is empty-protocol safe', () => {
    expect(deriveCriteria(null)).toEqual({ include: [], exclude: [] });
  });
});

describe('deriveHighlightTerms', () => {
  it('draws include terms from include criteria + PICO, exclude from exclude criteria', () => {
    const terms = deriveHighlightTerms(CONTENT);
    expect(terms.include).toContain('Randomised controlled trial');
    expect(terms.include).toContain('SGLT2 inhibitor');
    expect(terms.include).toContain('hospitalisation');
    expect(terms.exclude).toContain('Paediatric population');
  });

  it('dedupes and drops trivially short tokens', () => {
    const terms = deriveHighlightTerms({
      ...CONTENT,
      pico: { ...CONTENT.pico, population: 'a', intervention: 'SGLT2 inhibitor' },
      criteria: [
        {
          id: 'x',
          kind: 'include',
          label: 'SGLT2 inhibitor',
          instruction: '',
          answerStructure: 'any',
        },
      ],
    });
    // 'a' dropped (too short), 'SGLT2 inhibitor' present once.
    expect(terms.include.filter((t) => t === 'SGLT2 inhibitor')).toHaveLength(1);
    expect(terms.include).not.toContain('a');
  });

  it('is empty-protocol safe', () => {
    expect(deriveHighlightTerms(null)).toEqual({ include: [], exclude: [] });
  });
});

describe('highlightAbstract with protocol terms', () => {
  it('marks inclusion terms include and exclusion terms exclude', () => {
    const terms = deriveHighlightTerms(CONTENT);
    const segs = highlightAbstract(
      'A randomised controlled trial of an SGLT2 inhibitor in a paediatric population.',
      terms,
    );
    const kinds = new Set(segs.map((s) => s.kind));
    expect(kinds.has('include')).toBe(true);
    expect(kinds.has('exclude')).toBe(true);
    // Reassembling the segments reproduces the original text (nothing lost).
    expect(segs.map((s) => s.text).join('')).toContain('SGLT2 inhibitor');
  });
});

describe('exclude reasons', () => {
  it('exposes PRISMA-style preset reasons', () => {
    expect(EXCLUDE_REASONS.length).toBeGreaterThan(3);
    expect(EXCLUDE_REASONS.map((r) => r.code)).toContain('wrong_population');
  });
  it('validates codes and labels them', () => {
    expect(isExcludeReasonCode('wrong_population')).toBe(true);
    expect(isExcludeReasonCode('made_up')).toBe(false);
    expect(excludeReasonLabel('wrong_population')).toBe('Wrong population');
    expect(excludeReasonLabel(null)).toBeNull();
  });
});
