import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultCard } from '../result-card';
import type { UnifiedSearchResult } from '@/types/search';

function makeResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'A result title',
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

describe('ResultCard', () => {
  it('dispatches academic to AcademicResultCard (renders a Cite button)', () => {
    render(
      <ResultCard
        result={makeResult({ authors: ['Smith J'] })}
        tab="academic"
      />,
    );

    expect(screen.getByRole('button', { name: /cite/i })).toBeInTheDocument();
  });

  it('dispatches videos to VideoResultCard (renders a thumbnail img)', () => {
    render(
      <ResultCard
        result={makeResult({
          url: 'https://www.youtube.com/watch?v=abc123DEF45',
        })}
        tab="videos"
      />,
    );

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cite/i }),
    ).not.toBeInTheDocument();
  });

  it('dispatches web to WebResultCard variant="web" (domain, no Cite button)', () => {
    render(
      <ResultCard
        result={makeResult({
          url: 'https://example.com/article',
          domain: 'example.com',
        })}
        tab="web"
      />,
    );

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cite/i }),
    ).not.toBeInTheDocument();
  });

  it('dispatches news to WebResultCard variant="news" (sourceLabel)', () => {
    render(
      <ResultCard
        result={makeResult({
          url: 'https://reuters.com/article',
          sourceLabel: 'Reuters',
          domain: 'reuters.com',
        })}
        tab="news"
      />,
    );

    expect(screen.getByText(/Reuters/)).toBeInTheDocument();
  });

  it('dispatches discussions to WebResultCard variant="discussions" (renders engagement)', () => {
    render(
      <ResultCard
        result={makeResult({
          url: 'https://news.ycombinator.com/item?id=1',
          platform: 'Hacker News',
          engagement: '126 points · 67 comments',
        })}
        tab="discussions"
      />,
    );

    expect(screen.getByText(/Hacker News/)).toBeInTheDocument();
    expect(screen.getByText(/126/)).toBeInTheDocument();
  });
});
