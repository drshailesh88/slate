// ─────────────────────────────────────────────────────────────────────────────
// Export assembler (T19) — the science contract of the bundle:
//   • consensus and as-extracted are SEPARATE, distinctly-shaped datasets;
//   • provenance, the four states, and the derived flag survive assembly
//     (a blank is never a zero);
//   • a blinded refusal becomes an honest `withheld` section, never empty;
//   • ADVERSARIAL: the blinded datasets flow only through the real chokepoint —
//     a spoofed/stale store phase cannot leak a row during independent.
// ─────────────────────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getExtractionEntriesForExport,
  getRobAssessmentsForExport,
  getScreeningDecisionsForExport,
} from '@/lib/sr/authz/blinded-read';
import type { ConsensusRow } from '@/lib/sr/extraction/store';
import { buildExportBundle, toExportView, toProvenance } from './assemble';
import type { ExportDeps } from './assemble';
import { InMemoryExportStore } from './store';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const SECRET_PARTNER_VALUE = 'SECRET_PARTNER_VALUE_42';

const FACTS = {
  id: REVIEW_ID,
  title: 'Statins in sepsis',
  reviewType: 'intervention',
  screeningPhase: 'independent',
  extractionPhase: 'independent',
  robPhase: 'independent',
};

const STUDIES = [
  {
    id: 'st1',
    title: 'Alpha trial',
    abstract: null,
    authors: 'Smith J; Lee K',
    journal: 'Lancet',
    year: 2021,
    doi: '10.1000/alpha',
    externalId: 'PMID:111',
  },
];

const CONSENSUS: ConsensusRow[] = [
  {
    reviewId: REVIEW_ID,
    studyId: 'st1',
    fieldId: 'sample_size',
    value: '120',
    state: 'reported',
    source: 'reviewer1',
    derived: false,
    derivedFormula: null,
    provenance: { reportId: 'rep1', page: '4', locator: 'Table 2' },
    resolutionMethod: 'discuss',
    arbitratorId: null,
    authorContacted: false,
    authorContactNote: null,
    resolvedBy: SELF,
    resolvedAt: new Date('2026-01-02T00:00:00Z'),
  },
  {
    reviewId: REVIEW_ID,
    studyId: 'st1',
    fieldId: 'primary_outcome',
    value: null,
    state: 'not_reported',
    source: 'reviewer2',
    derived: false,
    derivedFormula: null,
    provenance: null,
    resolutionMethod: 'author_contact',
    arbitratorId: null,
    authorContacted: true,
    authorContactNote: 'Emailed 2026-01-01, no reply',
    resolvedBy: SELF,
    resolvedAt: new Date('2026-01-02T00:00:00Z'),
  },
  {
    reviewId: REVIEW_ID,
    studyId: 'st1',
    fieldId: 'effect_estimate',
    value: '4.2',
    state: 'reported',
    source: 'typed',
    derived: true,
    derivedFormula: 'SD from 95% CI',
    provenance: { reportId: 'rep1', page: '7', locator: null },
    resolutionMethod: 'arbitrator',
    arbitratorId: OTHER,
    authorContacted: false,
    authorContactNote: null,
    resolvedBy: OTHER,
    resolvedAt: new Date('2026-01-03T00:00:00Z'),
  },
];

function makeStore(overrides: Partial<typeof FACTS> = {}) {
  return new InMemoryExportStore({
    facts: { ...FACTS, ...overrides },
    studies: STUDIES,
    consensus: CONSENSUS,
    userLabels: { [SELF]: 'Dr. Self', [OTHER]: 'Dr. Other' },
  });
}

const blindedRefusal = (surface: 'screening' | 'extraction' | 'rob') =>
  vi
    .fn()
    .mockRejectedValue(
      new BlindedAccessError(surface, 'owner', 'independent', 'aggregate'),
    );

function fakeDeps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    store: makeStore(),
    readScreening: blindedRefusal('screening'),
    readEntries: blindedRefusal('extraction'),
    readRob: blindedRefusal('rob'),
    now: () => new Date('2026-07-07T12:00:00Z'),
    ...overrides,
  };
}

const ctx = { reviewId: REVIEW_ID, requesterId: SELF, role: 'owner' as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consensus and as-extracted stay separate and labeled', () => {
  it('exposes them as distinct datasets with distinct shapes', async () => {
    const asExtractedRows = [
      {
        id: 'e1',
        reviewId: REVIEW_ID,
        studyId: 'st1',
        fieldId: 'sample_size',
        reviewerId: SELF,
        value: '118',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: { reportId: 'rep1', page: '4' },
        isAi: false,
        lockedAt: null,
      },
    ];
    const bundle = await buildExportBundle(
      ctx,
      fakeDeps({ readEntries: vi.fn().mockResolvedValue(asExtractedRows) }),
    );

    // Consensus rows are never replaced by (or merged with) as-extracted rows:
    // the consensus keeps 120; the reviewer's original 118 lives in its own set.
    expect(
      bundle?.consensus.find((r) => r.fieldId === 'sample_size')?.value,
    ).toBe('120');
    expect(bundle?.asExtracted.status).toBe('ready');
    if (bundle?.asExtracted.status === 'ready') {
      expect(bundle.asExtracted.rows).toHaveLength(1);
      expect(bundle.asExtracted.rows[0].value).toBe('118');
      expect(bundle.asExtracted.rows[0].reviewerLabel).toBe('Dr. Self');
    }
  });

  it('labels the AI entry as an AI reviewer, never as a human', async () => {
    const bundle = await buildExportBundle(
      ctx,
      fakeDeps({
        readEntries: vi.fn().mockResolvedValue([
          {
            id: 'e-ai',
            reviewId: REVIEW_ID,
            studyId: 'st1',
            fieldId: 'sample_size',
            reviewerId: 'user-ai',
            value: '119',
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: null,
            isAi: true,
            lockedAt: null,
          },
        ]),
      }),
    );
    if (bundle?.asExtracted.status !== 'ready')
      throw new Error('expected ready');
    expect(bundle.asExtracted.rows[0].reviewerLabel).toBe('AI reviewer');
    expect(bundle.asExtracted.rows[0].isAi).toBe(true);
  });
});

describe('the four states, derived flag and provenance survive assembly', () => {
  it('keeps not_reported as an explicit state with a null value (never 0)', async () => {
    const bundle = await buildExportBundle(ctx, fakeDeps());
    const row = bundle?.consensus.find((r) => r.fieldId === 'primary_outcome');
    expect(row?.state).toBe('not_reported');
    expect(row?.value).toBeNull();
    expect(row?.authorContacted).toBe(true);
    expect(row?.resolutionMethod).toBe('author_contact');
  });

  it('keeps the derived flag + formula and structured provenance', async () => {
    const bundle = await buildExportBundle(ctx, fakeDeps());
    const derived = bundle?.consensus.find(
      (r) => r.fieldId === 'effect_estimate',
    );
    expect(derived?.derived).toBe(true);
    expect(derived?.derivedFormula).toBe('SD from 95% CI');
    expect(derived?.provenance).toEqual({
      reportId: 'rep1',
      page: '7',
      locator: null,
    });
    const reported = bundle?.consensus.find((r) => r.fieldId === 'sample_size');
    expect(reported?.provenance).toEqual({
      reportId: 'rep1',
      page: '4',
      locator: 'Table 2',
    });
  });

  it('field ids resolve to human labels', async () => {
    const bundle = await buildExportBundle(ctx, fakeDeps());
    expect(
      bundle?.consensus.find((r) => r.fieldId === 'sample_size')?.fieldLabel,
    ).toBe('Total sample size');
  });
});

describe('withheld blinded sections are honest, never silently empty', () => {
  it('during independent every blinded dataset is withheld with a reason', async () => {
    const bundle = await buildExportBundle(ctx, fakeDeps());
    for (const section of [
      bundle?.asExtracted,
      bundle?.rob,
      bundle?.screening,
    ]) {
      expect(section?.status).toBe('withheld');
      if (section?.status === 'withheld') {
        expect(section.reason).toMatch(/withheld|not available/i);
      }
    }
    // The non-blinded datasets still export.
    expect(bundle?.studies).toHaveLength(1);
    expect(bundle?.consensus).toHaveLength(3);
  });

  it('summarizes into the screen DTO without carrying rows', async () => {
    const bundle = await buildExportBundle(ctx, fakeDeps());
    const view = toExportView(bundle!);
    expect(view.studyCount).toBe(1);
    expect(view.consensusCount).toBe(3);
    expect(view.asExtracted.status).toBe('withheld');
    expect(view.asExtracted.reason).toBeTruthy();
    expect(JSON.stringify(view)).not.toContain('120');
  });

  it('returns null for an unknown review (the page 404s)', async () => {
    const deps = fakeDeps({ store: new InMemoryExportStore({ facts: null }) });
    expect(await buildExportBundle(ctx, deps)).toBeNull();
  });
});

describe('ADVERSARIAL — blinded data flows only through the real chokepoint', () => {
  function primeDb(...responses: Array<{ rows: unknown[] }>) {
    const execute = vi.fn();
    for (const r of responses) execute.mockResolvedValueOnce(r);
    (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
    return execute;
  }

  it('a spoofed reconcile phase in the store cannot leak a partner row during independent', async () => {
    // The store CLAIMS every surface is reconcile (stale/spoofed)…
    const store = makeStore({
      screeningPhase: 'reconcile',
      extractionPhase: 'reconcile',
      robPhase: 'reconcile',
    });
    // …but the chokepoint reads the authoritative phase itself: independent.
    // Prime a partner row behind each of the three phase reads — if any reader
    // got past the gate it would fetch and leak SECRET_PARTNER_VALUE.
    primeDb(
      { rows: [{ phase: 'independent' }] },
      { rows: [{ phase: 'independent' }] },
      { rows: [{ phase: 'independent' }] },
    );

    const bundle = await buildExportBundle(ctx, {
      store,
      readScreening: getScreeningDecisionsForExport,
      readEntries: getExtractionEntriesForExport,
      readRob: getRobAssessmentsForExport,
      now: () => new Date('2026-07-07T12:00:00Z'),
    });

    expect(bundle?.asExtracted.status).toBe('withheld');
    expect(bundle?.rob.status).toBe('withheld');
    expect(bundle?.screening.status).toBe('withheld');
    expect(JSON.stringify(bundle)).not.toContain(SECRET_PARTNER_VALUE);
    expect(JSON.stringify(bundle)).not.toContain(OTHER);
  });

  it('at reconcile the full as-extracted dataset flows through (positive control)', async () => {
    const store = makeStore({ extractionPhase: 'reconcile' });
    // The three readers start concurrently, so the three PHASE reads land
    // first (screening, extraction, rob in Promise.all order); only then does
    // the one reader that passed its gate fetch rows.
    primeDb(
      { rows: [{ phase: 'independent' }] }, // screening phase → refuse
      { rows: [{ phase: 'reconcile' }] }, // extraction phase → allow
      { rows: [{ phase: 'independent' }] }, // rob phase → refuse
      {
        rows: [
          {
            id: 'e2',
            review_id: REVIEW_ID,
            study_id: 'st1',
            field_id: 'sample_size',
            reviewer_id: OTHER,
            value: SECRET_PARTNER_VALUE,
            state: 'reported',
            derived: false,
            derived_formula: null,
            provenance: { reportId: 'rep1', page: '4' },
            is_ai: false,
            locked_at: null,
          },
        ],
      },
    );

    const bundle = await buildExportBundle(ctx, {
      store,
      readScreening: getScreeningDecisionsForExport,
      readEntries: getExtractionEntriesForExport,
      readRob: getRobAssessmentsForExport,
      now: () => new Date('2026-07-07T12:00:00Z'),
    });

    expect(bundle?.asExtracted.status).toBe('ready');
    if (bundle?.asExtracted.status === 'ready') {
      expect(bundle.asExtracted.rows[0].value).toBe(SECRET_PARTNER_VALUE);
      expect(bundle.asExtracted.rows[0].reviewerLabel).toBe('Dr. Other');
    }
  });
});

describe('toProvenance — never fabricates provenance', () => {
  it('returns null for empty/absent shapes', () => {
    expect(toProvenance(null)).toBeNull();
    expect(toProvenance(undefined)).toBeNull();
    expect(toProvenance('p4')).toBeNull();
    expect(toProvenance({})).toBeNull();
    expect(toProvenance({ reportId: '' })).toBeNull();
  });

  it('keeps only the structured fields', () => {
    expect(
      toProvenance({ reportId: 'r1', page: '4', locator: 'Fig 1', extra: 'x' }),
    ).toEqual({ reportId: 'r1', page: '4', locator: 'Fig 1' });
  });
});
