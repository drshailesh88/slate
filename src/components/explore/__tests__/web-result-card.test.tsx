import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebResultCard } from '../web-result-card';
import styles from '../web-result-card.module.css';
import type { UnifiedSearchResult } from '@/types/search';

function makeResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'Ketamine for treatment-resistant depression',
    authors: [],
    journal: '',
    year: 2024,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: [],
    ...overrides,
  };
}

function normalizeSpace(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

describe('WebResultCard', () => {
  it('renders a web result with domain, snippet, and an Open link', () => {
    const result = makeResult({
      url: 'https://example.com/article',
      domain: 'example.com',
      publishedAt: '2026-03-14T00:00:00Z',
      abstract: 'A summary of the article content.',
    });
    render(<WebResultCard result={result} variant="web" />);

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    expect(
      screen.getByText('A summary of the article content.'),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /open/i });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a discussions result with platform and engagement', () => {
    const result = makeResult({
      url: 'https://news.ycombinator.com/item?id=1',
      platform: 'Hacker News',
      engagement: '126 points · 67 comments',
    });
    render(<WebResultCard result={result} variant="discussions" />);

    expect(screen.getByText(/Hacker News/)).toBeInTheDocument();
    // The engagement digits render in their own --mono spans (design.md
    // §4), so "126 points · 67 comments" is no longer a single text node —
    // match against the meta line's full textContent instead.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'p' &&
          normalizeSpace(element.textContent) ===
            'Hacker News · 126 points · 67 comments',
      ),
    ).toBeInTheDocument();
  });

  it('mono-wraps only the engagement digits, not the surrounding words', () => {
    const result = makeResult({
      url: 'https://news.ycombinator.com/item?id=1',
      platform: 'Hacker News',
      engagement: '126 points · 67 comments',
    });
    const { container } = render(
      <WebResultCard result={result} variant="discussions" />,
    );

    const monoSpans = Array.from(
      container.querySelectorAll(`.${styles.numeral}`),
    );
    expect(monoSpans.map((span) => span.textContent)).toEqual(['126', '67']);
    monoSpans.forEach((span) => {
      expect(span.textContent).toMatch(/^\d+$/);
    });

    expect(screen.queryByText('points', { exact: false })).not.toHaveClass(
      styles.numeral,
    );
    expect(screen.queryByText('comments', { exact: false })).not.toHaveClass(
      styles.numeral,
    );
  });

  it('renders a news result with the outlet sourceLabel', () => {
    const result = makeResult({
      url: 'https://reuters.com/article',
      sourceLabel: 'Reuters',
      domain: 'reuters.com',
      publishedAt: '2026-01-05T00:00:00Z',
    });
    render(<WebResultCard result={result} variant="news" />);

    expect(screen.getByText(/Reuters/)).toBeInTheDocument();
  });

  it('never renders a Cite button (Cite is academic-only)', () => {
    const result = makeResult({ url: 'https://example.com' });
    render(<WebResultCard result={result} variant="web" />);

    expect(
      screen.queryByRole('button', { name: /cite/i }),
    ).not.toBeInTheDocument();
  });

  it('omits the date when publishedAt is absent', () => {
    const result = makeResult({
      url: 'https://example.com',
      domain: 'example.com',
      publishedAt: undefined,
    });
    const { container } = render(
      <WebResultCard result={result} variant="web" />,
    );

    // The domain is the only meta part — no trailing " · <date>" and no
    // mono date span, not just "the domain happens to be present".
    const metaLine = screen.getByText('example.com').closest('p');
    expect(metaLine).toBeInTheDocument();
    expect(normalizeSpace(metaLine?.textContent ?? null)).toBe('example.com');
    expect(container.querySelectorAll(`.${styles.numeral}`)).toHaveLength(0);
  });

  it('renders the title as plain text (no link) when getResultUrl is undefined', () => {
    const result = makeResult({ url: undefined, doi: undefined });
    render(<WebResultCard result={result} variant="web" />);

    expect(
      screen.queryByRole('link', { name: /ketamine/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Ketamine for treatment-resistant depression'),
    ).toBeInTheDocument();
  });
});
