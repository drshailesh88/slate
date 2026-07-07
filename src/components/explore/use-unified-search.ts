'use client';

import { useEffect, useState } from 'react';
import type { SearchResponse } from '@/types/search';

export type SearchState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: SearchResponse;
  error?: string;
};

type CompletedResult = {
  query: string;
  tab: 'academic';
  state: SearchState;
};

export function useUnifiedSearch(query: string, tab: 'academic'): SearchState {
  const trimmedQuery = query.trim();
  const [result, setResult] = useState<CompletedResult | null>(null);

  useEffect(() => {
    if (!trimmedQuery) {
      return;
    }
    const controller = new AbortController();
    const url = `/api/search/unified?q=${encodeURIComponent(trimmedQuery)}&tab=${tab}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Search failed (${r.status})`);
        return (await r.json()) as SearchResponse;
      })
      .then((data) => {
        setResult({
          query: trimmedQuery,
          tab,
          state: { status: 'success', data },
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResult({
          query: trimmedQuery,
          tab,
          state: {
            status: 'error',
            error: err instanceof Error ? err.message : 'Search failed',
          },
        });
      });
    return () => controller.abort();
  }, [trimmedQuery, tab]);

  if (!trimmedQuery) {
    return { status: 'idle' };
  }
  if (result === null || result.query !== trimmedQuery || result.tab !== tab) {
    return { status: 'loading' };
  }
  // Re-entering the exact last-completed query renders that result immediately
  // (stale-while-revalidate) while the effect above refetches in the background;
  // this is intentional, since clearing `result` here would re-trip
  // react-hooks/set-state-in-effect.
  return result.state;
}
