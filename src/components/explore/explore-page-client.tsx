'use client';

import { useState } from 'react';
import type { UnifiedSearchResult } from '@/types/search';
import { useUnifiedSearch } from './use-unified-search';
import { sourceStatusModel } from './source-status-chip';
import { ResultHeader } from './result-header';
import { TabBar } from './tab-bar';
import { FilterPills } from './filter-pills';
import { AcademicResultCard } from './academic-result-card';
import { ResultsSkeleton } from './results-skeleton';
import { NoResults } from './no-results';
import { SourceDegradedNote } from './source-degraded-note';
import { SearchError } from './search-error';
import { SearchBar } from './search-bar';
import styles from './explore-page-client.module.css';

// Continuity staggered entrance (design.md §8) — capped so a long result
// list doesn't turn into a slow reveal; items past the cap render instantly.
const STAGGER_CAP = 6;

function resultKey(result: UnifiedSearchResult, index: number): string {
  return (
    result.doi ??
    result.pmid ??
    result.arxivId ??
    result.url ??
    `${result.title}-${index}`
  );
}

/**
 * Owns the actual `useUnifiedSearch` call and is remounted (via a `key` on
 * the parent) whenever the query changes OR a retry is requested — that's
 * what makes "Try again" force a fresh fetch even when the query text is
 * unchanged, without needing to add a refetch escape hatch to the hook.
 */
function ExploreResults({
  query,
  onRetry,
}: {
  query: string;
  onRetry: () => void;
}) {
  const state = useUnifiedSearch(query, 'academic');

  if (state.status === 'idle') {
    return (
      <p className={styles.idle}>
        Search across PubMed, Semantic Scholar, OpenAlex, and more.
      </p>
    );
  }

  if (state.status === 'loading') {
    return <ResultsSkeleton />;
  }

  if (state.status === 'error') {
    return <SearchError query={query} onRetry={onRetry} />;
  }

  const data = state.data;
  if (!data) return null;

  if (data.results.length === 0) {
    return <NoResults query={query} />;
  }

  // A degraded source's zero count must never read as "no results" — the
  // note is derived from sourceStatusModel, not from re-inspecting counts.
  const model = sourceStatusModel(
    data.sourceStatuses,
    Object.keys(data.sourceCounts).length,
  );

  return (
    <>
      <ResultHeader data={data} />
      {model.degraded && <SourceDegradedNote model={model} />}
      <TabBar active="academic" onSelect={() => {}} />
      <FilterPills />
      <ol className={styles.results}>
        {data.results.map((result, index) => {
          const isAnimated = index < STAGGER_CAP;
          return (
            <li
              key={resultKey(result, index)}
              className={`${styles.resultItem} ${isAnimated ? styles.animated : ''}`}
              style={
                isAnimated
                  ? {
                      animationDelay: `calc(var(--motion-stagger) * ${index})`,
                    }
                  : undefined
              }
            >
              <AcademicResultCard result={result} />
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function ExplorePageClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className={styles.page}>
      <SearchBar value={query} onSubmit={setQuery} />
      <ExploreResults
        key={`${query}::${attempt}`}
        query={query}
        onRetry={() => setAttempt((a) => a + 1)}
      />
    </div>
  );
}
