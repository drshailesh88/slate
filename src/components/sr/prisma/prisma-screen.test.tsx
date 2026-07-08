import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import type { PrismaViewDTO } from '@/lib/sr/prisma/types';
import { PrismaScreen } from './prisma-screen';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REVIEW = '00000000-0000-4000-8000-000000000001';

const studyRefs: PrismaViewDTO['studies'] = {
  dup: { id: 'dup', title: 'Duplicate Trial', authors: 'Ng', year: 2019 },
  'ta-out': {
    id: 'ta-out',
    title: 'Screened-Out Trial',
    authors: 'Wu',
    year: 2020,
  },
  'ta-open': {
    id: 'ta-open',
    title: 'Awaiting Trial',
    authors: 'Li',
    year: 2021,
  },
  'ft-out': {
    id: 'ft-out',
    title: 'Fulltext-Excluded Trial',
    authors: 'Ro',
    year: 2022,
  },
  'ft-open': {
    id: 'ft-open',
    title: 'Fulltext-Open Trial',
    authors: 'Ma',
    year: 2023,
  },
  in: { id: 'in', title: 'Included Landmark Trial', authors: 'Ek', year: 2024 },
};

const identification: PrismaViewDTO['identification'] = {
  identified: 6,
  perSource: [
    {
      source: 'PubMed',
      count: 4,
      studyIds: ['dup', 'ta-out', 'ta-open', 'ft-open'],
    },
    { source: 'Embase', count: 2, studyIds: ['ft-out', 'in'] },
  ],
  duplicatesRemoved: 1,
  duplicateStudyIds: ['dup'],
  screened: 5,
};

// The withheld view: the server sent NO flow — the DTO shape cannot carry a
// stage count or per-reason breakdown while screening is independent.
const independentDto: PrismaViewDTO = {
  reviewId: REVIEW,
  state: 'independent',
  identification,
  progress: { finishedReviewers: 1, totalReviewers: 2 },
  flow: null,
  studies: studyRefs,
};

const reconcileDto: PrismaViewDTO = {
  reviewId: REVIEW,
  state: 'reconcile',
  identification,
  progress: null,
  flow: {
    screening: { screened: 5, excluded: 1, inProgress: 1, advanced: 3 },
    eligibility: {
      assessed: 3,
      excluded: 1,
      inProgress: 1,
      reasons: [
        {
          code: 'wrong_outcome',
          label: 'Wrong outcome',
          count: 1,
          studyIds: ['ft-out'],
        },
      ],
    },
    included: { studies: 1, reports: 1 },
    buckets: {
      duplicates: ['dup'],
      taExcluded: ['ta-out'],
      taInProgress: ['ta-open'],
      ftExcluded: ['ft-out'],
      ftInProgress: ['ft-open'],
      included: ['in'],
    },
  },
  studies: studyRefs,
};

describe('PrismaScreen — withheld (independent) state', () => {
  const markup = renderToStaticMarkup(<PrismaScreen dto={independentDto} />);

  it('shows the non-blinded identification numbers and safe progress only', () => {
    expect(markup).toContain('PRISMA 2020 flow diagram');
    expect(markup).toContain('records identified');
    expect(markup).toContain('PubMed');
    expect(markup).toContain('Embase');
    expect(markup).toContain('1 of 2 reviewers have finished screening');
  });

  it('marks every downstream stage Blinded and renders no stage outcome', () => {
    expect(markup).toContain('Blinded');
    expect(markup).toContain('Stage counts open after unblind');
    // No per-reason breakdown, no included/report line — the withheld boxes
    // carry a pill instead of a number.
    expect(markup).not.toContain('Wrong outcome');
    expect(markup).not.toContain('reports of included studies');
  });
});

describe('PrismaScreen — reconcile state', () => {
  const markup = renderToStaticMarkup(<PrismaScreen dto={reconcileDto} />);

  it('renders the full reconciling flow', () => {
    expect(markup).toContain('records screened (title &amp; abstract)');
    expect(markup).toContain('records excluded at title &amp; abstract');
    expect(markup).toContain('records awaiting a screening decision');
    expect(markup).toContain('reports assessed for eligibility (full text)');
    expect(markup).toContain('reports excluded, with reasons');
    expect(markup).toContain('reports awaiting a full-text decision');
    expect(markup).toContain('studies included in the review');
    expect(markup).toContain('1 reports of included studies');
    expect(markup).not.toContain('Stage counts open after unblind');
  });

  it('renders the per-reason full-text exclusion breakdown (Item 16b)', () => {
    expect(markup).toContain('Wrong outcome');
  });

  it('offers drill-downs on the counts', () => {
    expect(markup).toContain('aria-expanded');
  });
});

describe('PrismaScreen — drill-down', () => {
  it('clicking a count reveals the underlying records', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PrismaScreen dto={reconcileDto} />);
    });

    const includedBox = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('studies included in the review'),
    );
    expect(includedBox).toBeDefined();
    expect(container.textContent).not.toContain('Included Landmark Trial');

    await act(async () => {
      includedBox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Included Landmark Trial');
    expect(container.textContent).toContain('Ek · 2024');

    // Toggling the same count closes the panel again.
    await act(async () => {
      container
        .querySelectorAll('button')
        .forEach((b) =>
          b.textContent === 'Close'
            ? b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            : null,
        );
    });
    expect(container.textContent).not.toContain('Included Landmark Trial');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
