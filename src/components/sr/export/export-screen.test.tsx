// Export screen (T19) — the skin + the science contract of the UI:
//   • consensus and as-extracted render as two SEPARATE, labeled dataset rows;
//   • a withheld blinded dataset shows the honest reason and NO download link;
//   • every download href points at the chokepoint-backed API route.
// Rendered to static markup (no interactivity — it is a server component).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExportViewDTO } from '@/lib/sr/export/types';
import { ExportScreen } from './export-screen';

const WITHHELD_REASON =
  'Blinded per-reviewer as-extracted entries are withheld while extraction is independent. Unblind to reconcile to export them.';

function makeView(overrides: Partial<ExportViewDTO> = {}): ExportViewDTO {
  return {
    reviewId: 'review-1',
    reviewTitle: 'Statins in sepsis',
    reviewType: 'intervention',
    studyCount: 12,
    consensusCount: 34,
    asExtracted: { status: 'ready', count: 68, reason: null },
    rob: { status: 'ready', count: 10, reason: null },
    screening: { status: 'ready', count: 24, reason: null },
    ...overrides,
  };
}

function render(view: ExportViewDTO): string {
  return renderToStaticMarkup(<ExportScreen view={view} />);
}

describe('formats', () => {
  it('offers all four formats as downloads through the API route', () => {
    const html = render(makeView());
    expect(html).toContain('/api/sr/reviews/review-1/export?format=revman');
    expect(html).toContain('/api/sr/reviews/review-1/export?format=ris');
    expect(html).toContain(
      '/api/sr/reviews/review-1/export?format=csv&amp;dataset=consensus',
    );
    expect(html).toContain('/api/sr/reviews/review-1/export?format=pdf');
    for (const label of ['RevMan', 'RIS', 'CSV', 'PDF']) {
      expect(html).toContain(label);
    }
  });

  it('states the no-stats-engine stance', () => {
    expect(render(makeView())).toContain('RevMan or R');
  });
});

describe('consensus and as-extracted are separate, labeled dataset rows', () => {
  it('renders both rows with distinct labels and distinct download links', () => {
    const html = render(makeView());
    expect(html).toContain('Consensus — reconciled dataset');
    expect(html).toContain(
      'As-extracted — each reviewer&#x27;s original entries',
    );
    expect(html).toContain('dataset=consensus');
    expect(html).toContain('dataset=as_extracted');
    expect(html).toContain('never replaces the originals');
  });

  it('shows mono counts for ready datasets', () => {
    const html = render(makeView());
    expect(html).toContain('>34<');
    expect(html).toContain('>68<');
  });
});

describe('withheld blinded datasets', () => {
  const view = makeView({
    asExtracted: { status: 'withheld', count: 0, reason: WITHHELD_REASON },
    rob: { status: 'withheld', count: 0, reason: 'RoB withheld.' },
    screening: { status: 'withheld', count: 0, reason: 'Screening withheld.' },
  });

  it('shows the honest reason and a Withheld tag', () => {
    const html = render(view);
    expect(html).toContain('Withheld');
    expect(html).toContain('Unblind to reconcile to export them.');
  });

  it('renders NO download link for a withheld dataset', () => {
    const html = render(view);
    expect(html).not.toContain('dataset=as_extracted');
    expect(html).not.toContain('dataset=rob');
    expect(html).not.toContain('dataset=screening');
    // The non-blinded datasets still download.
    expect(html).toContain('dataset=references');
    expect(html).toContain('dataset=consensus');
  });
});
