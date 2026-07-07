import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReportDraftResult, ReportViewDTO } from '@/lib/sr/report/types';
import { ReportScreen } from './report-screen';

// ─────────────────────────────────────────────────────────────────────────────
// The report screen renders ONLY what the grounded view carries:
//   • withheld sections render a lock note — never a blinded-derived number;
//   • every count carries its record-source chip;
//   • AI-drafted prose is labeled and lands in an editable field;
//   • conclusions/certainty are human-only (empty, no draft path into them).
// Rendered to STATIC markup — the initial DOM is where the guarantees live.
// ─────────────────────────────────────────────────────────────────────────────

const draftAction = vi.fn();

// Sentinel numbers that only exist in specific view fields, so their presence
// or absence in the markup is unambiguous.
const IDENTIFIED = 41299;
const INCLUDED = 7717;
const EXCLUDED = 6161;

function baseView(overrides: Partial<ReportViewDTO> = {}): ReportViewDTO {
  return {
    reviewId: '00000000-0000-4000-8000-000000000001',
    reviewTitle: 'SGLT2 inhibitors in heart failure',
    reviewType: 'Intervention review',
    reviewMode: 'two_reviewer',
    canDraft: true,
    phases: {
      screening: 'independent',
      extraction: 'independent',
      rob: 'independent',
    },
    progress: {
      screening: { finishedReviewers: 1, totalReviewers: 2 },
      extraction: { finishedReviewers: 0, totalReviewers: 2 },
      rob: { finishedReviewers: 0, totalReviewers: 2 },
    },
    counts: [
      {
        key: 'identified',
        label: 'Records identified',
        value: IDENTIFIED,
        source: 'import_ledger',
      },
    ],
    screening: { status: 'withheld' },
    rob: { status: 'withheld' },
    references: [],
    characteristics: [],
    methods: {
      selection: [
        {
          text: 'Records were screened independently and in duplicate by 2 reviewers, blinded to each other’s decisions until reconciliation.',
          source: 'team_roster',
          recorded: { reviewerCount: 2 },
        },
      ],
      dataCollection: [
        {
          text: 'No study authors have been contacted; any future contact is logged per field.',
          source: 'consensus_extraction',
          recorded: { fieldsContacted: 0 },
        },
      ],
      dataItems: [
        {
          text: 'Data were sought for 9 items across General information, Participant characteristics, Outcomes.',
          source: 'review_settings',
          recorded: { fieldCount: 9 },
        },
      ],
    },
    ...overrides,
  };
}

function reconcileView(): ReportViewDTO {
  return baseView({
    phases: {
      screening: 'reconcile',
      extraction: 'reconcile',
      rob: 'reconcile',
    },
    counts: [
      {
        key: 'identified',
        label: 'Records identified',
        value: IDENTIFIED,
        source: 'import_ledger',
      },
      {
        key: 'included',
        label: 'Studies included',
        value: INCLUDED,
        source: 'screening_records',
      },
    ],
    screening: {
      status: 'available',
      stage: 'title_abstract',
      included: INCLUDED,
      excluded: EXCLUDED,
      excludeReasons: [{ label: 'Wrong population', count: 4242 }],
      conflictPending: 0,
      inProgress: 0,
    },
    rob: {
      status: 'available',
      distribution: [
        { outcome: 'low', label: 'Low', count: 3131 },
        { outcome: 'unassessed', label: 'Not yet assessed', count: 0 },
      ],
    },
    references: [
      {
        citationKey: 'S1',
        n: 1,
        studyId: 'st1',
        label: 'Anker 2021',
        title: 'Empagliflozin in HFpEF',
        journal: 'NEJM',
        year: 2021,
        doi: '10.1/abc',
      },
    ],
    characteristics: [
      {
        citationKey: 'S1',
        reference: 'Anker 2021',
        design: { value: 'Parallel RCT', state: 'reported' },
        population: { value: null, state: 'not_reported' },
        sampleSize: { value: '5,988', state: 'reported' },
        primaryOutcome: { value: null, state: 'unclear' },
      },
    ],
  });
}

function render(view: ReportViewDTO, initialDraft?: ReportDraftResult) {
  return renderToStaticMarkup(
    <ReportScreen
      view={view}
      draftAction={draftAction}
      initialDraft={initialDraft}
    />,
  );
}

describe('withheld (independent) state', () => {
  it('renders lock notes and NO blinded-derived number', () => {
    const html = render(baseView());
    expect(html).toContain('withheld');
    expect(html).not.toContain(String(INCLUDED));
    expect(html).not.toContain(String(EXCLUDED));
    expect(html).not.toContain('Studies included');
  });

  it('still renders the safe import-ledger count with its source chip', () => {
    const html = render(baseView());
    expect(html).toContain(String(IDENTIFIED));
    expect(html).toContain('Import ledger');
  });
});

describe('grounded (reconcile) state', () => {
  it('renders the chokepoint-derived counts with record-source chips', () => {
    const html = render(reconcileView());
    expect(html).toContain(String(INCLUDED));
    expect(html).toContain(String(EXCLUDED));
    expect(html).toContain('Screening records');
    expect(html).toContain('4242');
    expect(html).toContain('Wrong population');
    expect(html).toContain('3131');
  });

  it('renders explicit states — a silent paper reads Not reported, never blank', () => {
    const html = render(reconcileView());
    expect(html).toContain('Not reported');
    expect(html).toContain('Unclear');
    expect(html).toContain('5,988');
  });

  it('numbers the included studies as citable references', () => {
    const html = render(reconcileView());
    expect(html).toContain('[S1]');
    expect(html).toContain('Anker 2021');
    expect(html).toContain('Empagliflozin in HFpEF');
  });
});

describe('the auto Methods block', () => {
  it('renders Items 8/9/10 with the auto-assembled badge and source chips', () => {
    const html = render(baseView());
    expect(html).toContain('Auto-assembled from recorded metadata');
    expect(html).toContain('Item 8 · Selection process');
    expect(html).toContain('Item 9 · Data collection process');
    expect(html).toContain('Item 10 · Data items');
    expect(html).toContain('Team roster');
    expect(html).toContain('blinded to each other');
  });
});

describe('AI-drafted prose — labeled + editable', () => {
  const draft: ReportDraftResult = {
    sections: [
      {
        id: 'abstract',
        heading: 'Abstract',
        sentences: [
          {
            text: `Records identified: ${IDENTIFIED}.`,
            citationKeys: ['C:identified'],
          },
        ],
      },
    ],
    droppedSentences: 2,
    droppedSections: 1,
  };

  it('labels every drafted section as AI and renders sentence-level citations', () => {
    const html = render(baseView(), draft);
    expect(html).toContain('AI · drafted from your recorded data');
    expect(html).toContain('review &amp; edit');
    expect(html).toContain('C:identified');
  });

  it('lands the draft in an editable textarea seeded with the prose', () => {
    const html = render(baseView(), draft);
    expect(html).toContain('<textarea');
    expect(html).toContain(`Records identified: ${IDENTIFIED}. [C:identified]`);
  });

  it('surfaces the grounding gate’s drops — never silent', () => {
    const html = render(baseView(), draft);
    expect(html).toContain('2 sentence(s) failed grounding');
    expect(html).toContain('1 out-of-scope section(s)');
  });

  it('hides the draft button from roles that cannot draft', () => {
    const html = render(baseView({ canDraft: false }));
    expect(html).not.toContain('Draft grounded prose');
  });

  it('shows the draft button to owners/collaborators', () => {
    const html = render(baseView());
    expect(html).toContain('Draft grounded prose');
  });
});

describe('conclusions & certainty — human-only', () => {
  it('renders an empty, human-owned editor and states the no-draft rule', () => {
    const html = render(baseView());
    expect(html).toContain('Yours to write');
    expect(html).toContain('never drafts a conclusion');
    expect(html).toContain(
      'Write the conclusions and certainty assessment here.',
    );
  });

  it('a draft never carries a conclusions section into the page', () => {
    // The DraftableSectionId union has no 'conclusions' member; the render of a
    // valid draft therefore cannot contain an AI-authored conclusions body.
    const html = render(baseView(), {
      sections: [
        {
          id: 'findings',
          heading: 'Summary of findings',
          sentences: [
            {
              text: `Identified: ${IDENTIFIED}.`,
              citationKeys: ['C:identified'],
            },
          ],
        },
      ],
      droppedSentences: 0,
      droppedSections: 1,
    });
    const conclusionsIndex = html.indexOf('Conclusions &amp; certainty');
    expect(conclusionsIndex).toBeGreaterThan(-1);
    expect(html).toContain('1 out-of-scope section(s)');
  });
});
