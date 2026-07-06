import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResponse, UnifiedSearchResult } from '@/types/search';
import type { SearchState } from '../use-unified-search';

const { useUnifiedSearchMock } = vi.hoisted(() => ({
  useUnifiedSearchMock:
    vi.fn<(query: string, tab: 'academic') => SearchState>(),
}));

vi.mock('../use-unified-search', () => ({
  useUnifiedSearch: useUnifiedSearchMock,
}));

import { ExplorePageClient } from '../explore-page-client';

function academicResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'SGLT2 inhibitors reduce heart failure hospitalization',
    authors: ['Smith J', 'Doe A'],
    journal: 'NEJM',
    year: 2023,
    citationCount: 142,
    publicationTypes: [],
    isOpenAccess: true,
    sources: ['pubmed'],
    ...overrides,
  };
}

function normalizeSpace(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

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

describe('ExplorePageClient', () => {
  beforeEach(() => {
    useUnifiedSearchMock.mockReset();
  });

  it('renders the skeleton while loading, never a spinner', () => {
    useUnifiedSearchMock.mockReturnValue({ status: 'loading' });
    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('renders a result card, the honest-count line, tab bar, and filter pills on success', () => {
    const data = searchResponse({
      results: [academicResult()],
      total: 1,
      matchedTotal: 1,
      sourceCounts: { pubmed: 1 },
    });
    useUnifiedSearchMock.mockReturnValue({ status: 'success', data });

    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(
      screen.getByText(/SGLT2 inhibitors reduce heart failure hospitalization/),
    ).toBeInTheDocument();
    // The count line's numerals render in their own --mono <span>s (see
    // ResultHeader's renderCountLine), so the "1"s are not direct text nodes
    // of the <p> — match against the element's full textContent instead of
    // getByText's default (direct-text-node-only) algorithm.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'p' &&
          normalizeSpace(element.textContent) === '1 matched across 1 source',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /academic/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: /^scope/i })).toBeInTheDocument();
  });

  it('shows the degraded Amber note and still renders results — a degraded source is never read as empty', () => {
    const data = searchResponse({
      results: [academicResult()],
      total: 1,
      matchedTotal: 1,
      sourceCounts: { pubmed: 1, semantic_scholar: 0 },
      sourceStatuses: { semantic_scholar: { status: 'timeout' } },
    });
    useUnifiedSearchMock.mockReturnValue({ status: 'success', data });

    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(
      screen.getByText(/Semantic Scholar is temporarily unavailable/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Academic coverage is unaffected\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/SGLT2 inhibitors reduce heart failure hospitalization/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No papers matched/)).not.toBeInTheDocument();
  });

  it('renders the No-results serif line when a query yields zero results', () => {
    const data = searchResponse({
      results: [],
      total: 0,
      matchedTotal: 0,
      sourceCounts: { pubmed: 0 },
    });
    useUnifiedSearchMock.mockReturnValue({ status: 'success', data });

    render(<ExplorePageClient initialQuery="asdkjqweqwe" />);

    expect(
      screen.getByText('No papers matched "asdkjqweqwe" in Academic.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Try broader terms, widen the time window, or search the Web\./,
      ),
    ).toBeInTheDocument();
  });

  it('renders the error state with a working Try again that preserves the query and re-triggers the search', async () => {
    const user = userEvent.setup();
    useUnifiedSearchMock.mockReturnValue({ status: 'error', error: 'boom' });

    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(screen.getByText("Couldn't run that search")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search/i })).toHaveValue(
      'SGLT2',
    );

    const callsBefore = useUnifiedSearchMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(useUnifiedSearchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(useUnifiedSearchMock).toHaveBeenLastCalledWith('SGLT2', 'academic');
  });
});
