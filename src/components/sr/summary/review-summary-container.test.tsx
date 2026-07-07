import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnchorHTMLAttributes } from 'react';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  SrReviewProvider,
  type SrReviewContextValue,
} from '@/components/sr/review-context';
import { ReviewSummaryContainer } from './review-summary-container';

// The container reads the layout-resolved review context. That context is fed by
// the chokepoint (getSafeProgress) + the non-blinded `studies` count — NEVER a
// client store or the blinded tables. Feeding a known-safe context and asserting
// the funnel renders exactly those numbers proves the count call site is the
// chokepoint-sourced context, not a fabricated client-side derivation.
const CONTEXT: SrReviewContextValue = {
  reviewId: 'rev-ctx',
  title: 'Statins in primary prevention',
  reviewType: 'Intervention review',
  role: 'reviewer',
  studyCount: 208,
  safeProgress: {
    screening: { finishedReviewers: 1, totalReviewers: 2 },
    extraction: { finishedReviewers: 0, totalReviewers: 2 },
    rob: { finishedReviewers: 0, totalReviewers: 2 },
  },
};

function render(context: SrReviewContextValue) {
  return renderToStaticMarkup(
    <SrReviewProvider value={context}>
      <ReviewSummaryContainer />
    </SrReviewProvider>,
  );
}

describe('ReviewSummaryContainer', () => {
  it('renders the funnel from the chokepoint-sourced review context', () => {
    const html = render(CONTEXT);
    expect(html).toContain('208');
    expect(html).toContain('1 of 2 reviewers finished');
    expect(html).toContain('Statins in primary prevention');
  });

  it('shows only safe completion progress — no distribution leak', () => {
    const html = render(CONTEXT);
    expect(html).toContain('completion only');
    expect(html).not.toContain('Reviewer contribution');
    expect(html).not.toContain('One vote');
    expect(html).not.toContain('excluded');
  });

  it('drops into first-run guidance for an unpopulated review', () => {
    const html = render({ ...CONTEXT, studyCount: 0 });
    expect(html).toContain('No references yet');
    expect(html).not.toContain('Team progress');
  });
});
