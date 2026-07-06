import { describe, expect, it } from 'vitest';
import {
  PICO_FIELDS,
  SUGGESTED_CRITERIA,
  deriveScreeningCriteria,
  emptyProtocolContent,
} from './constants';
import type { ProtocolContent } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Ported from the ScholarSync precursor (src/lib/sr/__tests__/protocol.test.ts),
// adapted to the Slate ProtocolContent shape (the precursor's createMockReview
// fixture is replaced by an inline content fixture).
// ─────────────────────────────────────────────────────────────────────────────

const draft: ProtocolContent = {
  researchQuestion:
    'In adults with heart failure, do SGLT2 inhibitors reduce hospitalisation?',
  pico: {
    population: 'Adults with heart failure',
    intervention: 'SGLT2 inhibitors',
    comparator: 'Placebo or standard care',
    outcome: 'HF hospitalisation or mortality',
    studyDesign: 'Randomised controlled trials',
  },
  criteria: [
    {
      id: 'c1',
      kind: 'include',
      label: 'Adults with heart failure',
      instruction: 'Include adults with a heart-failure diagnosis.',
      answerStructure: 'yes_no_maybe',
    },
    {
      id: 'c2',
      kind: 'include',
      label: 'SGLT2-inhibitor intervention',
      instruction: 'Include studies of an SGLT2-inhibitor intervention.',
      answerStructure: 'yes_no_maybe',
    },
    {
      id: 'c3',
      kind: 'include',
      label: 'Randomised controlled trial',
      instruction: 'Include randomised controlled trials.',
      answerStructure: 'yes_no_maybe',
    },
    {
      id: 'c4',
      kind: 'include',
      label: 'Reports HF hospitalisation or mortality',
      instruction: 'Include studies reporting HF hospitalisation or mortality.',
      answerStructure: 'yes_no_maybe',
    },
    {
      id: 'c5',
      kind: 'exclude',
      label: 'Conference abstract only',
      instruction: 'Exclude records available only as a conference abstract.',
      answerStructure: 'yes_no_maybe',
    },
  ],
};

describe('PICO_FIELDS', () => {
  it('lists the five PICO(S) fields in order', () => {
    expect(PICO_FIELDS.map((f) => f.key)).toEqual([
      'population',
      'intervention',
      'comparator',
      'outcome',
      'studyDesign',
    ]);
  });
});

describe('deriveScreeningCriteria', () => {
  it('collapses the structured criteria into the labels screening shows', () => {
    const criteria = deriveScreeningCriteria(draft);
    expect(criteria.inclusion).toEqual([
      'Adults with heart failure',
      'SGLT2-inhibitor intervention',
      'Randomised controlled trial',
      'Reports HF hospitalisation or mortality',
    ]);
    expect(criteria.exclusion).toContain('Conference abstract only');
  });

  it('returns empty inclusion/exclusion lists for an empty protocol', () => {
    const criteria = deriveScreeningCriteria(emptyProtocolContent());
    expect(criteria.inclusion).toEqual([]);
    expect(criteria.exclusion).toEqual([]);
  });
});

describe('SUGGESTED_CRITERIA', () => {
  it('offers Elicit-style suggested criteria not already in the protocol', () => {
    const existing = new Set(draft.criteria.map((c) => c.label));
    expect(SUGGESTED_CRITERIA.length).toBeGreaterThan(0);
    expect(SUGGESTED_CRITERIA.every((c) => c.label && c.instruction)).toBe(
      true,
    );
    expect(SUGGESTED_CRITERIA.some((c) => !existing.has(c.label))).toBe(true);
  });
});

describe('protocol content shape', () => {
  it('gives every eligibility criterion an instruction and answer structure', () => {
    for (const criterion of draft.criteria) {
      expect(criterion.instruction.length).toBeGreaterThan(0);
      expect(['any', 'specified', 'yes_no_maybe']).toContain(
        criterion.answerStructure,
      );
      expect(['include', 'exclude']).toContain(criterion.kind);
    }
  });

  it('starts from a blank PICO with all five fields present', () => {
    const empty = emptyProtocolContent();
    expect(Object.keys(empty.pico).sort()).toEqual([
      'comparator',
      'intervention',
      'outcome',
      'population',
      'studyDesign',
    ]);
    expect(empty.researchQuestion).toBe('');
    expect(empty.criteria).toEqual([]);
  });
});
