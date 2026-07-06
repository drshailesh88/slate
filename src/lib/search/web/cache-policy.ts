/**
 * Cache policy for the non-academic search tabs (web / news / discussions / videos).
 *
 * These tabs fan out to paid/quota'd upstreams (Exa, Brave, NewsData, YouTube), so
 * caching the query-global federation result is the single biggest cost lever. TTL is
 * matched to how fast the truth changes (IMPROVEMENT-PLAN §1): news is freshness-first
 * and caches only briefly (still collapsing bursts of the same query); web/videos
 * relevance is stable so they cache long — and the long video TTL also shields the
 * scarce 100-searches/day YouTube quota. Discussions sit between.
 */

export type NonAcademicTab = "web" | "news" | "discussions" | "videos";

const TTL_SECONDS: Record<NonAcademicTab, number> = {
  news: 10 * 60,
  discussions: 3 * 3600,
  web: 6 * 3600,
  videos: 12 * 3600,
};

export function nonAcademicCacheTtl(tab: NonAcademicTab): number {
  return TTL_SECONDS[tab];
}

/**
 * Only cache a healthy, non-empty result. A degraded (throttled/partial) or empty
 * response must never be cached — otherwise one bad fan-out is served for the whole
 * TTL. Mirrors the academic path's `shouldCache` guard.
 */
export function shouldCacheFederatedList(value: {
  results: unknown[];
  degraded: boolean;
}): boolean {
  return !value.degraded && value.results.length > 0;
}
