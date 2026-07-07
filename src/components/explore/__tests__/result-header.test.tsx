import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultHeader } from '../result-header';
import type { SearchResponse } from '@/types/search';

function searchResponse(
  overrides: Partial<SearchResponse> = {},
): SearchResponse {
  return {
    results: [],
    total: 0,
    page: 1,
    perPage: 20,
    hasMore: false,
    sourceCounts: {},
    ...overrides,
  };
}

function normalizeSpace(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

// The count line's numerals render in their own --mono <span>s (see
// ResultHeader's renderCountLine), so digits are not direct text nodes of
// the <p> — match against the <p>'s full textContent instead of getByText's
// default (direct-text-node-only, and ambiguous-across-ancestors-for-regex)
// algorithm.
function countLine(): HTMLElement {
  return screen.getByText(
    (_, element) => element?.tagName.toLowerCase() === 'p',
  );
}

describe('ResultHeader', () => {
  it('shows the source chip and "matched across" count for the academic tab', () => {
    const data = searchResponse({
      matchedTotal: 142,
      total: 142,
      sourceCounts: { pubmed: 100, europepmc: 42 },
    });

    render(<ResultHeader data={data} tab="academic" />);

    expect(normalizeSpace(countLine().textContent)).toBe(
      '142 matched across 2 sources',
    );
    expect(screen.getByText('2 sources')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sources/i }),
    ).toBeInTheDocument();
  });

  it('defaults to the academic tab when none is passed', () => {
    const data = searchResponse({
      matchedTotal: 12,
      total: 12,
      sourceCounts: { pubmed: 12 },
    });

    render(<ResultHeader data={data} />);

    expect(normalizeSpace(countLine().textContent)).toBe(
      '12 matched across 1 source',
    );
    expect(
      screen.getByRole('button', { name: /sources/i }),
    ).toBeInTheDocument();
  });

  it('shows a bare tab-appropriate count with no source chip or Sources button for the web tab', () => {
    const data = searchResponse({ total: 43, sourceCounts: { web: 43 } });

    render(<ResultHeader data={data} tab="web" />);

    expect(normalizeSpace(countLine().textContent)).toBe('43 web results');
    expect(
      screen.queryByRole('button', { name: /sources/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('2 sources')).not.toBeInTheDocument();
  });
});
