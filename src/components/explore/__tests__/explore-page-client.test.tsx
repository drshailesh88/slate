import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResponse, UnifiedSearchResult } from '@/types/search';
import type { SearchState } from '../use-unified-search';
import type { ExploreTab } from '../tab-bar';

const { useUnifiedSearchMock } = vi.hoisted(() => ({
  useUnifiedSearchMock:
    vi.fn<(query: string, tab: ExploreTab) => SearchState>(),
}));

const { useRouterMock, usePathnameMock, useSearchParamsMock } = vi.hoisted(
  () => ({
    useRouterMock: vi.fn(),
    usePathnameMock: vi.fn(),
    useSearchParamsMock: vi.fn(),
  }),
);

vi.mock('../use-unified-search', () => ({
  useUnifiedSearch: useUnifiedSearchMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: useRouterMock,
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
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

function webResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'A clinician’s guide to SGLT2 inhibitors',
    authors: [],
    journal: '',
    year: 2024,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: [],
    url: 'https://example.com/sglt2-guide',
    domain: 'example.com',
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
  let mockReplace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useUnifiedSearchMock.mockReset();
    mockReplace = vi.fn();
    useRouterMock.mockReturnValue({ replace: mockReplace, push: vi.fn() });
    usePathnameMock.mockReturnValue('/explore');
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('renders the skeleton while loading, never a spinner, and keeps the TabBar switchable', () => {
    useUnifiedSearchMock.mockReturnValue({ status: 'loading' });
    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();

    // TabBar is persistent chrome — it renders even while loading, so a tab
    // is switchable from any state, not just a populated result list.
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^web/i })).not.toBeDisabled();
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

  it('shows the degraded Amber note and still renders results — a degraded source is never read as empty (regression)', () => {
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
    // Regression: the source chip is still Academic-only.
    expect(screen.getByText(/1 of 2 sources/)).toBeInTheDocument();
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

  it('renders the No-results serif line for a genuine zero-match result even when one source is ok', () => {
    const data = searchResponse({
      results: [],
      total: 0,
      matchedTotal: 0,
      sourceCounts: { pubmed: 0, semantic_scholar: 0 },
      sourceStatuses: {
        pubmed: { status: 'ok' },
        semantic_scholar: { status: 'timeout' },
      },
    });
    useUnifiedSearchMock.mockReturnValue({ status: 'success', data });

    render(<ExplorePageClient initialQuery="asdkjqweqwe" />);

    expect(
      screen.getByText('No papers matched "asdkjqweqwe" in Academic.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/temporarily unavailable/i),
    ).not.toBeInTheDocument();
  });

  it('renders the whole-tab Sources-unavailable state (not No-results) when every academic source is down', () => {
    const data = searchResponse({
      results: [],
      total: 0,
      matchedTotal: 0,
      sourceCounts: { pubmed: 0, europepmc: 0 },
      sourceStatuses: {
        pubmed: { status: 'timeout' },
        europepmc: { status: 'error' },
      },
    });
    useUnifiedSearchMock.mockReturnValue({ status: 'success', data });

    render(<ExplorePageClient initialQuery="SGLT2" />);

    expect(
      screen.getByText('Academic search is temporarily unavailable'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No papers matched/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /try again/i }),
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

  describe('live tab switching', () => {
    it('selecting the Web tab calls the hook with tab="web" and renders a web card, count, and caveat with no source chip', async () => {
      const user = userEvent.setup();
      useUnifiedSearchMock.mockImplementation((_query, tab) => {
        if (tab === 'web') {
          return {
            status: 'success',
            data: searchResponse({
              results: [webResult()],
              total: 2,
              sourceCounts: { web: 2 },
            }),
          };
        }
        return {
          status: 'success',
          data: searchResponse({
            results: [academicResult()],
            total: 1,
            matchedTotal: 1,
            sourceCounts: { pubmed: 1 },
          }),
        };
      });

      render(<ExplorePageClient initialQuery="SGLT2" />);
      await user.click(screen.getByRole('tab', { name: /^web/i }));

      expect(useUnifiedSearchMock).toHaveBeenCalledWith('SGLT2', 'web');
      expect(
        screen.getByText(/A clinician’s guide to SGLT2 inhibitors/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName.toLowerCase() === 'p' &&
            normalizeSpace(element.textContent) === '2 web results',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/Web results are early/)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /sources/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/\d+ sources?$/)).not.toBeInTheDocument();
    });

    it('renders SourcesUnavailable (not "0 sources" or "No … matched") when a non-academic tab reports searxngUnavailable', () => {
      useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=web'));
      useUnifiedSearchMock.mockReturnValue({
        status: 'success',
        data: searchResponse({
          results: [],
          total: 0,
          sourceCounts: {},
          searxngUnavailable: true,
        }),
      });

      render(<ExplorePageClient initialQuery="tirzepatide" />);

      expect(
        screen.getByText('Web search is temporarily unavailable'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/0 sources/)).not.toBeInTheDocument();
      expect(screen.queryByText(/No .* matched/)).not.toBeInTheDocument();
      expect(useUnifiedSearchMock).toHaveBeenCalledWith('tirzepatide', 'web');
    });

    it('renders the per-tab NoResults (not SourcesUnavailable) when a non-academic tab is genuinely empty, and its action switches to Academic', async () => {
      const user = userEvent.setup();
      useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=web'));
      useUnifiedSearchMock.mockImplementation((_query, tab) => {
        if (tab === 'academic') {
          return {
            status: 'success',
            data: searchResponse({
              results: [academicResult()],
              total: 1,
              matchedTotal: 1,
              sourceCounts: { pubmed: 1 },
            }),
          };
        }
        return {
          status: 'success',
          data: searchResponse({
            results: [],
            total: 0,
            sourceCounts: {},
            searxngUnavailable: false,
          }),
        };
      });

      render(<ExplorePageClient initialQuery="tirzepatide" />);

      expect(
        screen.getByText('No web results for "tirzepatide".'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Web search is temporarily unavailable'),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Search Academic →' }),
      );

      expect(useUnifiedSearchMock).toHaveBeenCalledWith(
        'tirzepatide',
        'academic',
      );
      expect(screen.getByRole('tab', { name: /academic/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('seeds the active tab from a valid ?tab= and falls back to Academic for an invalid one', () => {
      useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=videos'));
      useUnifiedSearchMock.mockReturnValue({ status: 'loading' });

      render(<ExplorePageClient initialQuery="SGLT2" />);

      expect(screen.getByRole('tab', { name: /^videos/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(useUnifiedSearchMock).toHaveBeenCalledWith('SGLT2', 'videos');
    });

    it('falls back to Academic when ?tab= holds an unknown value', () => {
      useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=bogus'));
      useUnifiedSearchMock.mockReturnValue({ status: 'loading' });

      render(<ExplorePageClient initialQuery="SGLT2" />);

      expect(screen.getByRole('tab', { name: /academic/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(useUnifiedSearchMock).toHaveBeenCalledWith('SGLT2', 'academic');
    });

    it('syncs ?tab= via router.replace (preserving other params) after the user switches tabs', async () => {
      const user = userEvent.setup();
      useSearchParamsMock.mockReturnValue(new URLSearchParams('q=SGLT2'));
      useUnifiedSearchMock.mockReturnValue({ status: 'loading' });

      render(<ExplorePageClient initialQuery="SGLT2" />);
      expect(mockReplace).not.toHaveBeenCalled();

      await user.click(screen.getByRole('tab', { name: /^news/i }));

      expect(mockReplace).toHaveBeenCalledWith('/explore?q=SGLT2&tab=news', {
        scroll: false,
      });
    });
  });
});
