import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebResultCard } from '../web-result-card';
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
    expect(screen.getByText(/126 points · 67 comments/)).toBeInTheDocument();
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
    render(<WebResultCard result={result} variant="web" />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
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
