import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useUnifiedSearch } from '../use-unified-search';
import type { SearchResponse } from '@/types/search';

type FetchCall = {
  url: string | URL | Request;
  signal: AbortSignal;
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
};

/**
 * A controllable `fetch` mock: every call is recorded (with its abort signal)
 * and returns a promise the test settles manually, so races between queries
 * can be driven deterministically instead of guessed at with timers.
 */
function createMockFetch(options: { autoRejectOnAbort?: boolean } = {}) {
  const { autoRejectOnAbort = true } = options;
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    let resolve!: (value: Response) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<Response>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const signal = init?.signal ?? undefined;
    if (signal && autoRejectOnAbort) {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }
    calls.push({ url, signal: signal as AbortSignal, resolve, reject });
    return promise;
  });
  return { fetchMock, calls };
}

function fakeResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
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

/** Drains the microtask queue (including chained `.then` callbacks) before a macrotask runs. */
function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useUnifiedSearch', () => {
  it('is idle for an empty or whitespace-only query and never calls fetch', () => {
    const { fetchMock } = createMockFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result: emptyResult } = renderHook(() =>
      useUnifiedSearch('', 'academic'),
    );
    expect(emptyResult.current).toEqual({ status: 'idle' });

    const { result: whitespaceResult } = renderHook(() =>
      useUnifiedSearch('   ', 'academic'),
    );
    expect(whitespaceResult.current).toEqual({ status: 'idle' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes from loading to success once fetch resolves', async () => {
    const body = searchResponse({ total: 1, sourceCounts: { pubmed: 1 } });
    const { fetchMock, calls } = createMockFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useUnifiedSearch('diabetes', 'academic'),
    );

    expect(result.current).toEqual({ status: 'loading' });

    calls[0].resolve(fakeResponse(body));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(body);
  });

  it('does not flash the previous query result while the new query is loading', async () => {
    const bodyAlpha = searchResponse({ total: 1, sourceCounts: { pubmed: 1 } });
    const { fetchMock, calls } = createMockFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => useUnifiedSearch(query, 'academic'),
      {
        initialProps: { query: 'alpha' },
      },
    );

    calls[0].resolve(fakeResponse(bodyAlpha));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(bodyAlpha);

    rerender({ query: 'beta' });

    // Beta's fetch is still in flight: the derived state must show loading, never
    // alpha's stale success data (this is the race the reviewer verified by hand).
    expect(result.current).toEqual({ status: 'loading' });
    expect(calls).toHaveLength(2);

    const bodyBeta = searchResponse({ total: 2, sourceCounts: { pubmed: 2 } });
    calls[1].resolve(fakeResponse(bodyBeta));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(bodyBeta);
  });

  it('requests the given tab and transitions loading to success', async () => {
    const body = searchResponse({ total: 43 });
    const { fetchMock, calls } = createMockFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUnifiedSearch('q', 'web'));

    expect(result.current).toEqual({ status: 'loading' });
    expect(calls[0].url).toContain('&tab=web');

    calls[0].resolve(fakeResponse(body));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(body);
  });

  it('surfaces an error state when the response is not ok', async () => {
    const { fetchMock, calls } = createMockFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useUnifiedSearch('bad query', 'academic'),
    );

    calls[0].resolve(fakeResponse(null, { ok: false, status: 500 }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Search failed (500)');
  });

  it('ignores a superseded request even when it resolves after being aborted', async () => {
    const { fetchMock, calls } = createMockFetch({ autoRejectOnAbort: false });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => useUnifiedSearch(query, 'academic'),
      {
        initialProps: { query: 'first query' },
      },
    );

    rerender({ query: 'second query' });
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls).toHaveLength(2);

    rerender({ query: 'third query' });
    expect(calls[1].signal.aborted).toBe(true);
    expect(calls).toHaveLength(3);

    // The superseded "second query" request settles late -- with a genuine success
    // body, not even an AbortError -- after the hook has already moved on to "third
    // query". It must be ignored rather than clobbering the newer state.
    const staleBody = searchResponse({
      total: 99,
      sourceCounts: { pubmed: 99 },
    });
    await act(async () => {
      calls[1].resolve(fakeResponse(staleBody));
      await flushMicrotasks();
    });
    expect(result.current).toEqual({ status: 'loading' });

    const freshBody = searchResponse({ total: 1, sourceCounts: { pubmed: 1 } });
    calls[2].resolve(fakeResponse(freshBody));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(freshBody);
  });
});
