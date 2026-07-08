import { describe, expect, it } from 'vitest';
import {
  buildGroundingSources,
  extractNumericTokens,
  filterGroundedSentences,
  validateSentence,
  type GroundingSource,
} from './grounding';
import type { ReportViewDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The grounding gate — the report's anti-hallucination contract. A sentence
// lives only if it cites known sources and carries no number its cited sources
// don't support.
// ─────────────────────────────────────────────────────────────────────────────

const SOURCES: GroundingSource[] = [
  {
    key: 'C:identified',
    label: 'Records identified',
    description: 'Records identified: 412',
    allowedNumbers: [412],
  },
  {
    key: 'S1',
    label: 'Anker 2021',
    description: '[1] Anker 2021 — Empagliflozin in HFpEF (n = 5988)',
    allowedNumbers: [2021, 1, 5988],
  },
];

const byKey = new Map(SOURCES.map((s) => [s.key, s]));

describe('extractNumericTokens', () => {
  it('finds integers, decimals, percents and comma-separated thousands', () => {
    expect(
      extractNumericTokens('412 records; recall 0.97; 21% of 5,988'),
    ).toEqual([412, 0.97, 21, 5988]);
  });

  it('returns nothing for prose without numbers', () => {
    expect(extractNumericTokens('No numbers here.')).toEqual([]);
  });

  it('a digit inside an identifier (SGLT2, RoB2) is not a numeric claim', () => {
    expect(
      extractNumericTokens('SGLT2 inhibitors appraised with RoB2'),
    ).toEqual([]);
    expect(extractNumericTokens('SGLT2 inhibitors in 412 records')).toEqual([
      412,
    ]);
  });
});

describe('validateSentence', () => {
  it('accepts a cited sentence whose numbers are all supported', () => {
    expect(
      validateSentence(
        {
          text: '412 records were identified.',
          citationKeys: ['C:identified'],
        },
        byKey,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects a sentence with no citation', () => {
    expect(
      validateSentence({ text: 'A claim.', citationKeys: [] }, byKey),
    ).toEqual({ ok: false, reason: 'no_citation' });
  });

  it('rejects a citation key the source table does not carry', () => {
    expect(
      validateSentence({ text: 'A claim.', citationKeys: ['S99'] }, byKey),
    ).toEqual({ ok: false, reason: 'unknown_citation' });
  });

  it('kills a hallucinated number — the core contract', () => {
    expect(
      validateSentence(
        {
          text: 'Hospitalisation fell by 27% in Anker 2021.',
          citationKeys: ['S1'],
        },
        byKey,
      ),
    ).toEqual({ ok: false, reason: 'ungrounded_number' });
  });

  it('a number is supported only by the sources the sentence CITES', () => {
    // 412 exists in the table, but the sentence cites only S1 — rejected.
    expect(
      validateSentence(
        { text: 'Anker 2021 covered 412 records.', citationKeys: ['S1'] },
        byKey,
      ),
    ).toEqual({ ok: false, reason: 'ungrounded_number' });
  });

  it('a multi-cited sentence may combine its cited sources', () => {
    expect(
      validateSentence(
        {
          text: 'Of 412 records, Anker 2021 contributed 5,988 participants.',
          citationKeys: ['C:identified', 'S1'],
        },
        byKey,
      ),
    ).toEqual({ ok: true });
  });
});

describe('filterGroundedSentences', () => {
  it('keeps grounded sentences, drops and counts the rest', () => {
    const { kept, dropped } = filterGroundedSentences(
      [
        {
          text: '412 records were identified.',
          citationKeys: ['C:identified'],
        },
        { text: 'Made-up 99% effect.', citationKeys: ['S1'] },
        { text: 'Uncited claim.', citationKeys: [] },
      ],
      SOURCES,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(2);
  });
});

describe('buildGroundingSources', () => {
  const view: ReportViewDTO = {
    reviewId: 'r1',
    reviewTitle: 'A review',
    reviewType: 'Intervention review',
    reviewMode: 'two_reviewer',
    canDraft: true,
    phases: {
      screening: 'reconcile',
      extraction: 'reconcile',
      rob: 'independent',
    },
    progress: {
      screening: { finishedReviewers: 2, totalReviewers: 2 },
      extraction: { finishedReviewers: 0, totalReviewers: 2 },
      rob: { finishedReviewers: 0, totalReviewers: 2 },
    },
    counts: [
      {
        key: 'identified',
        label: 'Records identified',
        value: 412,
        source: 'import_ledger',
      },
    ],
    screening: {
      status: 'available',
      stage: 'title_abstract',
      included: 4,
      excluded: 120,
      excludeReasons: [{ label: 'Wrong population', count: 80 }],
      conflictPending: 0,
      inProgress: 0,
    },
    rob: { status: 'withheld' },
    references: [
      {
        citationKey: 'S1',
        n: 1,
        studyId: 'st1',
        label: 'Anker 2021',
        title: 'Empagliflozin in HFpEF',
        journal: 'NEJM',
        year: 2021,
        doi: null,
      },
    ],
    characteristics: [
      {
        citationKey: 'S1',
        reference: 'Anker 2021',
        design: { value: 'Parallel RCT', state: 'reported' },
        population: { value: 'Adults with HFpEF', state: 'reported' },
        sampleSize: { value: '5,988', state: 'reported' },
        primaryOutcome: { value: null, state: 'not_reported' },
      },
    ],
    methods: { selection: [], dataCollection: [], dataItems: [] },
  };

  it('exposes counts, per-reason exclusions and study references as sources', () => {
    const sources = buildGroundingSources(view);
    const keys = sources.map((s) => s.key);
    expect(keys).toContain('C:identified');
    expect(keys).toContain('C:excluded.Wrong population');
    expect(keys).toContain('S1');
  });

  it('a study source carries its year, number and consensus-cell numbers', () => {
    const s1 = buildGroundingSources(view).find((s) => s.key === 'S1');
    expect(s1?.allowedNumbers).toContain(2021);
    expect(s1?.allowedNumbers).toContain(5988);
  });

  it('a withheld section contributes NO source — a draft cannot cite blinded data', () => {
    const sources = buildGroundingSources(view);
    expect(sources.some((s) => s.key.startsWith('C:rob.'))).toBe(false);
  });
});
