import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { extractionSections } from '@/lib/sr/extraction/fields';
import type {
  IndependentExtractionViewDTO,
  ReconcileExtractionViewDTO,
} from '@/lib/sr/extraction/types';

// The actions pull in next/cache + server-only code, and the screen uses the app
// router — mock both so the client screen renders in isolation. We render to
// STATIC markup: the initial (un-interacted) DOM, which is exactly where the
// firewall assertions live (AI hidden until source opened; consensus empty).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(app)/systematic-review/[reviewId]/extraction/actions', () => ({
  saveEntryAction: vi.fn(),
  finishExtractionAction: vi.fn(),
  unblindExtractionAction: vi.fn(),
  resolveFieldAction: vi.fn(),
  logAuthorContactAction: vi.fn(),
  leaveUnresolvedAction: vi.fn(),
}));

import { ExtractionScreen } from './extraction-screen';

const REVIEW = '00000000-0000-4000-8000-000000000001';

const PARTNER_SECRET = 'PARTNER_SECRET_VALUE';
const AI_SECRET = 'AI_SECRET_VALUE';

const independentDto: IndependentExtractionViewDTO = {
  reviewId: REVIEW,
  reviewTitle: 'A review',
  reviewType: 'intervention',
  phase: 'independent',
  canExtract: true,
  canUnblind: false,
  sections: extractionSections(),
  progress: { finishedReviewers: 0, totalReviewers: 2 },
  studies: [
    {
      id: 'st-1',
      refId: '#1',
      title: 'Trial One',
      authors: 'Ng',
      journal: 'JAMA',
      year: 2021,
      doi: null,
    },
  ],
  ownEntries: [
    {
      studyId: 'st-1',
      fieldId: 'sample_size',
      value: '120',
      state: 'reported',
      derived: false,
      derivedFormula: null,
      provenance: { reportId: 'rep1', page: '4', locator: null },
      locked: false,
    },
  ],
  finished: false,
};

const reconcileDto: ReconcileExtractionViewDTO = {
  reviewId: REVIEW,
  reviewTitle: 'A review',
  reviewType: 'intervention',
  phase: 'reconcile',
  canExtract: false,
  canUnblind: true,
  sections: extractionSections(),
  progress: { finishedReviewers: 2, totalReviewers: 2 },
  qcSampleRate: 0.2,
  fieldsToVerify: 1,
  canResolve: true,
  eligibleArbitrators: [],
  studies: [
    {
      study: {
        id: 'st-1',
        refId: '#1',
        title: 'Trial One',
        authors: 'Ng',
        journal: 'JAMA',
        year: 2021,
        doi: null,
      },
      fieldsToVerify: 1,
      fields: [
        {
          fieldId: 'sample_size',
          label: 'Total sample size',
          section: 'characteristics',
          critical: false,
          reviewer1: {
            slot: 'reviewer1',
            reviewerName: 'Dr. A',
            isAi: false,
            value: '120',
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: { reportId: 'rep1', page: '4', locator: null },
            sourceQuote: null,
          },
          reviewer2: {
            slot: 'reviewer2',
            reviewerName: 'Dr. B',
            isAi: false,
            value: PARTNER_SECRET,
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: { reportId: 'rep1', page: '4', locator: null },
            sourceQuote: null,
          },
          ai: {
            slot: 'ai',
            reviewerName: null,
            isAi: true,
            value: AI_SECRET,
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: null,
            sourceQuote: 'The trial randomised 240 patients…',
          },
          final: { kind: 'conflict', value: null },
          agreed: false,
          conflict: true,
          qcFlagged: false,
          consensus: null,
        },
        {
          fieldId: 'country',
          label: 'Country / setting',
          section: 'general',
          critical: false,
          reviewer1: {
            slot: 'reviewer1',
            reviewerName: 'Dr. A',
            isAi: false,
            value: 'UK',
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: null,
            sourceQuote: null,
          },
          reviewer2: {
            slot: 'reviewer2',
            reviewerName: 'Dr. B',
            isAi: false,
            value: 'UK',
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: null,
            sourceQuote: null,
          },
          ai: {
            slot: 'ai',
            reviewerName: null,
            isAi: true,
            value: 'FR', // AI disagrees — must NOT become the agreed value
            state: 'reported',
            derived: false,
            derivedFormula: null,
            provenance: null,
            sourceQuote: 'Conducted in France…',
          },
          final: { kind: 'agreed', value: 'UK', state: 'reported' },
          agreed: true,
          conflict: false,
          qcFlagged: false,
          consensus: null,
        },
      ],
    },
  ],
};

function render(view: Parameters<typeof ExtractionScreen>[0]['view']): string {
  return renderToStaticMarkup(<ExtractionScreen view={view} />);
}

describe('Phase 1 — independent extraction (blind)', () => {
  const html = render(independentDto);

  it('shows the blinding banner explaining independence', () => {
    expect(html).toContain('Extracting independently');
    expect(html.toLowerCase()).toContain('hidden until you both lock');
  });

  it('renders all four extraction states (a blank is never a zero)', () => {
    expect(html).toContain('Reported');
    expect(html).toContain('Not reported');
    expect(html).toContain('N/A');
    expect(html).toContain('Unclear');
  });

  it('offers the lock (finish) action and provenance capture', () => {
    expect(html).toContain('Finish extraction');
    expect(html).toContain('Report'); // provenance input placeholder
    expect(html).toContain('Derived');
  });

  it('never renders a partner or AI value (the DTO cannot carry one)', () => {
    expect(html).not.toContain(PARTNER_SECRET);
    expect(html).not.toContain(AI_SECRET);
  });
});

describe('Phase 2 — reconciliation (the symmetric picker)', () => {
  const html = render(reconcileDto);

  it('frames progress as fields to verify, never "conflicts to 0"', () => {
    expect(html).toContain('1 field to verify');
    expect(html).not.toContain('conflicts to 0');
    expect(html).toContain('QC sample 20%');
  });

  it('shows both reviewers at equal weight — neither pre-selected', () => {
    expect(html).toContain('120');
    expect(html).toContain(PARTNER_SECRET); // partner value IS visible at reconcile
    expect(html).not.toContain('aria-selected');
    // both "Use this" pick buttons render (symmetric), neither is a default.
    const picks = html.match(/Use this/g) ?? [];
    expect(picks.length).toBeGreaterThanOrEqual(2);
  });

  it('starts the consensus EMPTY for a conflict (Final null until a human picks)', () => {
    expect(html).toContain('Empty — pick a value');
  });

  it('hides the AI value behind the source-open reveal (non-neg #5)', () => {
    // Initial (un-interacted) render: only the "Open source passage" affordance
    // is present; the AI value and its Show-AI reveal are NOT yet in the DOM.
    expect(html).toContain('Open source passage');
    expect(html).not.toContain(AI_SECRET);
    expect(html).not.toContain('Show AI suggestion');
  });

  it('THE CORRECTION: an agreed field shows the HUMAN value, never the AI value', () => {
    // Both reviewers agreed on "UK"; the AI said "FR". Consensus shows UK.
    expect(html).toContain('UK');
    expect(html).not.toContain('FR'); // AI value never surfaces as the agreed value
    expect(html).toContain('Agreed');
  });
});
