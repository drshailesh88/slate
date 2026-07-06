import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnchorHTMLAttributes } from 'react';

// Render next/link as a plain anchor so built-vs-inert stage links are observable
// in static markup without a Next router context (mirrors sr-stage-rail.test).
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

import { buildFunnelSummary } from '@/lib/sr/summary/funnel';
import type { SafeProgress } from '@/lib/sr/authz/policy';
import { ReviewSummary } from './review-summary';

const REVIEW_ID = 'rev-1';

const INDEPENDENT_PROGRESS: SafeProgress = {
  screening: { finishedReviewers: 2, totalReviewers: 3 },
  extraction: { finishedReviewers: 0, totalReviewers: 3 },
  rob: { finishedReviewers: 1, totalReviewers: 1 },
};

function render(studyCount: number, progress = INDEPENDENT_PROGRESS) {
  const model = buildFunnelSummary({
    reviewId: REVIEW_ID,
    studyCount,
    safeProgress: progress,
  });
  return renderToStaticMarkup(
    <ReviewSummary
      model={model}
      reviewTitle="SGLT2 meta-analysis"
      reviewType="Intervention review"
      role="reviewer"
    />,
  );
}

describe('ReviewSummary — renders safe chokepoint counts', () => {
  it('shows the imported total and per-surface completion counts', () => {
    const html = render(412);
    expect(html).toContain('Review Summary');
    expect(html).toContain('412');
    expect(html).toContain('2 of 3 reviewers finished');
    expect(html).toContain('1 of 1 reviewer finished');
  });

  it('links built stages and marks unbuilt funnel stages as coming soon', () => {
    const html = render(412);
    expect(html).toContain(`href="/systematic-review/${REVIEW_ID}/import"`);
    // Screening has no route yet → coming-soon marker, never a link target.
    expect(html).toContain('Soon');
    expect(html).not.toContain(
      `href="/systematic-review/${REVIEW_ID}/screening"`,
    );
    expect(html).not.toContain(`href="/systematic-review/${REVIEW_ID}/export"`);
  });

  it('shows the first-run guidance and no funnel when nothing is imported', () => {
    const html = render(0);
    expect(html).toContain('No references yet');
    expect(html).toContain('Import references');
    expect(html).not.toContain('Team progress');
  });
});

describe('ReviewSummary — never leaks blinded data during independent', () => {
  it('renders completion counts only — no distribution, conflicts, or per-partner rows', () => {
    const html = render(412);

    // The safe readout is present…
    expect(html).toContain('Team progress');
    expect(html).toContain('completion only');

    // …and the precursor's leaky team-progress surfaces are absent. Any of these
    // during independent would reveal a co-reviewer's decisions.
    expect(html).not.toContain('Reviewer contribution');
    expect(html).not.toContain('One vote');
    expect(html).not.toContain('No votes');
    expect(html).not.toContain('excluded');
    expect(html).not.toContain('included');
    expect(html).not.toContain('to assess');
  });

  it('shows no decision numbers even when reviewers have finished', () => {
    // Everyone finished — a naive summary might now show the tally. The safe
    // funnel still emits only "N of M finished", never how they voted.
    const html = render(120, {
      screening: { finishedReviewers: 3, totalReviewers: 3 },
      extraction: { finishedReviewers: 3, totalReviewers: 3 },
      rob: { finishedReviewers: 3, totalReviewers: 3 },
    });
    expect(html).toContain('3 of 3 reviewers finished');
    expect(html).not.toContain('Reviewer contribution');
    expect(html).not.toContain('Conflicts <');
    expect(html).not.toContain('excluded');
  });
});
