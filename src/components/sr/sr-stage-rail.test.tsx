import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnchorHTMLAttributes } from 'react';

const REVIEW_ID = 'rev-x';

vi.mock('next/navigation', () => ({
  usePathname: () => `/systematic-review/${REVIEW_ID}`,
}));

// Render next/link as a plain anchor so the rail's link-vs-disabled decision is
// observable in static markup without a Next router context.
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

import { SrStageRail } from './sr-stage-rail';

function render() {
  return renderToStaticMarkup(
    <SrStageRail
      reviewId={REVIEW_ID}
      title="Demo review"
      meta="Intervention review · 7 studies"
      studyCount={7}
    />,
  );
}

describe('SrStageRail', () => {
  it('links every built stage', () => {
    const html = render();
    const base = `/systematic-review/${REVIEW_ID}`;
    for (const href of [
      base,
      `${base}/members`,
      `${base}/protocol`,
      `${base}/import`,
      `${base}/screening`,
      `${base}/conflicts`,
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('renders unbuilt funnel stages as disabled, not links', () => {
    const html = render();
    const base = `/systematic-review/${REVIEW_ID}`;
    // Coming-soon stages carry the disabled marker and never a link target.
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Soon');
    expect(html).not.toContain(`href="${base}/full-text"`);
    expect(html).not.toContain(`href="${base}/export"`);
  });

  it('shows the imported study count on Import', () => {
    expect(render()).toContain('>7<');
  });

  it('renders the project title and meta', () => {
    const html = render();
    expect(html).toContain('Demo review');
    expect(html).toContain('Intervention review · 7 studies');
  });
});
