/**
 * News authority floor (IMPROVEMENT-PLAN §3 — reputation insurance, not a ranking lever).
 *
 * The news tab is low-traffic but reputation-sensitive: one embarrassing low-trust result
 * (a content farm, a fringe blog) reads worse than a slightly weaker ranking. Rather than
 * chase ranking (measured: no reranker helps), this GUARANTEES a quality floor — only
 * credible outlets (government + major journalism) surface. A min-results safeguard keeps
 * the tab from going sparse: if too few credible results exist, the best non-credible ones
 * backfill so the page is never empty.
 */
import type { UnifiedSearchResult } from "@/types/search";
import { getTrustTier, type TrustTier } from "@/lib/search/trust-tier";

const CREDIBLE_TIERS: ReadonlySet<TrustTier> = new Set<TrustTier>(["government", "major_journalism"]);

/** Default minimum results below which non-credible sources are allowed to backfill. */
const DEFAULT_MIN_RESULTS = 5;

function tierOf(r: UnifiedSearchResult): TrustTier {
  return r.trustTier ?? getTrustTier(r.domain ?? r.url ?? null);
}

/**
 * Keep only credible-outlet news, preserving rank order. If fewer than `minResults`
 * credible results exist, backfill with the highest-ranked non-credible ones so the tab
 * is never emptied. Set NEWS_AUTHORITY_FLOOR=0 (handled by the caller) to disable.
 */
export function applyNewsAuthorityFloor(
  results: UnifiedSearchResult[],
  minResults = DEFAULT_MIN_RESULTS
): UnifiedSearchResult[] {
  const credible = results.filter((r) => CREDIBLE_TIERS.has(tierOf(r)));
  if (credible.length >= minResults) return credible;
  const rest = results.filter((r) => !CREDIBLE_TIERS.has(tierOf(r)));
  return [...credible, ...rest.slice(0, minResults - credible.length)];
}
