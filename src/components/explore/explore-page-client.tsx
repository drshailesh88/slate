'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { SearchResponse, UnifiedSearchResult } from '@/types/search';
import { useUnifiedSearch } from './use-unified-search';
import { sourceStatusModel } from './source-status-chip';
import { ResultHeader } from './result-header';
import { TabBar, type ExploreTab } from './tab-bar';
import { TabCaveat } from './tab-caveat';
import { TAB_LABELS, isAcademicTab } from './tab-meta';
import { FilterPills } from './filter-pills';
import { ResultCard } from './result-card';
import { ResultsSkeleton } from './results-skeleton';
import { NoResults } from './no-results';
import { SourceDegradedNote } from './source-degraded-note';
import { SourcesUnavailable } from './sources-unavailable';
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

// `?tab=` only ever seeds/serializes one of the five known tabs — anything
// else (missing, stale, or hand-edited) falls back to Academic rather than
// rendering a broken tablist. Must check own-property, not `in` — `in` walks
// the prototype chain, so a value like "toString" or "constructor" would
// pass validation and then blow up `NOUNS[tab]` downstream as not-a-tuple.
function isExploreTab(value: string | null): value is ExploreTab {
  return value !== null && Object.hasOwn(TAB_LABELS, value);
}

/**
 * A source absent from `sourceStatuses` (or "ok") is silent about health, so
 * emptiness there reads as genuine — only when every reported source is
 * non-"ok" is this a whole-tab outage, never "no papers/results matched".
 */
function academicSourcesDown(
  sourceStatuses: SearchResponse['sourceStatuses'],
): boolean {
  const statuses = Object.values(sourceStatuses ?? {});
  return statuses.length > 0 && !statuses.some((s) => s.status === 'ok');
}

type SearchResultsState = ReturnType<typeof useUnifiedSearch>;

/**
 * Owns the actual `useUnifiedSearch` call and is remounted (via a `key` on
 * the parent) whenever the query, tab, or retry attempt changes — that's
 * what makes "Try again" force a fresh fetch even when the query/tab are
 * unchanged, without needing to add a refetch escape hatch to the hook.
 *
 * The tab chrome (TabBar + TabCaveat) renders before the state-dependent
 * body in every branch below, so a tab is switchable from idle/loading/error
 * too — not just from a populated result list.
 */
function ExploreResults({
  query,
  tab,
  onSelectTab,
  onRetry,
}: {
  query: string;
  tab: ExploreTab;
  onSelectTab: (tab: ExploreTab) => void;
  onRetry: () => void;
}) {
  const state = useUnifiedSearch(query, tab);

  return (
    <>
      <TabBar active={tab} onSelect={onSelectTab} />
      <TabCaveat tab={tab} />
      <ExploreResultsBody
        query={query}
        tab={tab}
        state={state}
        onSelectTab={onSelectTab}
        onRetry={onRetry}
      />
    </>
  );
}

function ExploreResultsBody({
  query,
  tab,
  state,
  onSelectTab,
  onRetry,
}: {
  query: string;
  tab: ExploreTab;
  state: SearchResultsState;
  onSelectTab: (tab: ExploreTab) => void;
  onRetry: () => void;
}) {
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
    const isDown = isAcademicTab(tab)
      ? academicSourcesDown(data.sourceStatuses)
      : data.searxngUnavailable === true;

    return isDown ? (
      <SourcesUnavailable tab={tab} onRetry={onRetry} />
    ) : (
      <NoResults query={query} tab={tab} onSwitchTab={onSelectTab} />
    );
  }

  // A degraded source's zero count must never read as "no results" — the
  // note is derived from sourceStatusModel, not from re-inspecting counts.
  // Only Academic aggregates across sources, so the note is Academic-only.
  const model = sourceStatusModel(data.sourceStatuses, data.sourceCounts);

  return (
    <>
      <ResultHeader data={data} tab={tab} />
      {isAcademicTab(tab) && model.degraded && (
        <SourceDegradedNote model={model} />
      )}
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
              <ResultCard result={result} tab={tab} />
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function ExplorePageClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<ExploreTab>(() => {
    const tabParam = searchParams.get('tab');
    return isExploreTab(tabParam) ? tabParam : 'academic';
  });
  const [attempt, setAttempt] = useState(0);

  const searchParamsString = searchParams.toString();
  const isFirstRender = useRef(true);

  // Keep `?tab=` in sync with a *switched* tab so it survives a reload/share
  // — preserves every other param (notably `q`) untouched. Skips the first
  // render so a plain page load doesn't rewrite the URL before the user has
  // touched a tab (the seed effect above already reads `?tab=` correctly).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    if (params.get('tab') === activeTab) return;
    params.set('tab', activeTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleRetry = useCallback(() => setAttempt((a) => a + 1), []);

  return (
    <div className={styles.page}>
      <SearchBar value={query} onSubmit={setQuery} />
      <ExploreResults
        key={`${query}::${activeTab}::${attempt}`}
        query={query}
        tab={activeTab}
        onSelectTab={setActiveTab}
        onRetry={handleRetry}
      />
    </div>
  );
}
