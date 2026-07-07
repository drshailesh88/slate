/**
 * Maximal Marginal Relevance (MMR) diversification for the result page.
 *
 * Why: a broad topic query ("management of HFrEF") can return a top page that is
 * five near-identical meta-analyses of the same finding — high relevance, low
 * coverage. MMR re-orders the page to trade a little relevance for diversity, so a
 * distinct-but-relevant paper surfaces above a redundant near-duplicate.
 *
 * Safe-by-construction: it reorders ONLY within the fixed top-K set (never pulls
 * from the tail, never drops anything), so the SET of top-K results is unchanged —
 * recall@k provably cannot regress; only the within-page order changes. The leading
 * `anchor` results (the exact-title / trial-primary winner that upstream steps
 * pinned at #1) are kept in place.
 */

import type { UnifiedSearchResult } from "@/types/search";
import { normalizeDomain } from "@/lib/search/domain-utils";

function titleTokens(title: string): Set<string> {
  return new Set(
    (title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
}

/** Jaccard overlap of two papers' title token sets, in [0,1]. */
export function titleSimilarity(a: UnifiedSearchResult, b: UnifiedSearchResult): number {
  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface MmrOptions {
  /** Page size to diversify (default 10). Results past this are left untouched. */
  k?: number;
  /** Relevance-vs-diversity trade-off in [0,1]; higher favors relevance (default 0.75). */
  lambda?: number;
  /** Number of leading results to pin unchanged (default 1 — the #1 anchor). */
  anchor?: number;
}

/**
 * Re-order the top-K of an already-ranked list by MMR. Relevance is taken from the
 * incoming rank (the list is assumed sorted best-first, so earlier = more
 * relevant), and redundancy is the max title-similarity to an already-selected
 * result. Greedy, stable on ties (lower incoming rank wins), and a pure function.
 */
export function diversifyTopK(
  results: UnifiedSearchResult[],
  opts: MmrOptions = {}
): UnifiedSearchResult[] {
  const anchor = Math.max(0, opts.anchor ?? 1);
  const lambda = Math.min(1, Math.max(0, opts.lambda ?? 0.75));
  const k = Math.min(opts.k ?? 10, results.length);
  // Nothing to reorder: fewer than two movable candidates.
  if (k - anchor < 2) return results;

  const head = results.slice(0, k);
  const tail = results.slice(k);
  // Incoming-rank relevance in [0,1] (position 0 = 1, position k-1 ≈ 1/k).
  const relevance = head.map((_, i) => (k - i) / k);

  const selected: UnifiedSearchResult[] = head.slice(0, anchor);
  const remaining = head.slice(anchor).map((r, i) => ({ r, idx: anchor + i }));

  while (remaining.length > 0) {
    let bestPos = 0;
    let bestScore = -Infinity;
    for (let p = 0; p < remaining.length; p++) {
      const { r, idx } = remaining[p];
      let maxSim = 0;
      for (const s of selected) {
        const sim = titleSimilarity(r, s);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * relevance[idx] - (1 - lambda) * maxSim;
      // Strictly-greater keeps it stable: earlier (higher-ranked) ties win.
      if (mmr > bestScore) {
        bestScore = mmr;
        bestPos = p;
      }
    }
    selected.push(remaining[bestPos].r);
    remaining.splice(bestPos, 1);
  }

  return [...selected, ...tail];
}

function domainKey(r: UnifiedSearchResult): string {
  return (r.domain ?? (r.url ? normalizeDomain(r.url) ?? "" : "")).toLowerCase();
}

export interface DomainMmrOptions {
  /** Size of the diversified window (default 10). */
  k?: number;
  /** Relevance-vs-diversity trade-off in [0,1]; higher favors relevance (default 0.7). */
  lambda?: number;
  /** Number of leading results to pin unchanged (default 0). */
  anchor?: number;
}

/**
 * Diversity-aware top-K SELECTION by domain (MMR). Unlike {@link diversifyTopK}
 * (which reorders within a FIXED set on title similarity), this CHANGES the top-K
 * set: it greedily fills K slots, penalizing each candidate by how many of its
 * domain are already chosen, so a distinct-domain result deeper in the pool can be
 * promoted above a redundant same-domain one. This lifts the set-based "unique
 * domains in top-K" signal — e.g. breaks a single-outlet news flood or a
 * single-platform discussions page. Relevance is the incoming rank (the pool is
 * assumed sorted best-first); `lambda`↑ favors relevance over diversity. Pure
 * function; every result is preserved (the unselected tail keeps its original order).
 */
export function diversifyByDomain(
  results: UnifiedSearchResult[],
  opts: DomainMmrOptions = {}
): UnifiedSearchResult[] {
  const n = results.length;
  const k = Math.min(opts.k ?? 10, n);
  const lambda = Math.min(1, Math.max(0, opts.lambda ?? 0.7));
  const anchor = Math.max(0, opts.anchor ?? 0);
  if (n < 2 || k - anchor < 2) return results;

  // Incoming-rank relevance in [0,1] over the FULL pool (position 0 = 1).
  const relevance = results.map((_, i) => (n - i) / n);
  const counts = new Map<string, number>();
  const out: UnifiedSearchResult[] = [];
  for (let i = 0; i < anchor; i++) {
    out.push(results[i]);
    const dk = domainKey(results[i]);
    counts.set(dk, (counts.get(dk) ?? 0) + 1);
  }

  const remaining = results.slice(anchor).map((r, i) => ({ r, idx: anchor + i }));

  while (out.length < k && remaining.length > 0) {
    let bestPos = 0;
    let bestScore = -Infinity;
    for (let p = 0; p < remaining.length; p++) {
      const { r, idx } = remaining[p];
      const redundancy = counts.get(domainKey(r)) ?? 0;
      const mmr = lambda * relevance[idx] - (1 - lambda) * redundancy;
      // Strictly-greater keeps it stable: earlier (higher-ranked) ties win.
      if (mmr > bestScore) {
        bestScore = mmr;
        bestPos = p;
      }
    }
    const chosen = remaining.splice(bestPos, 1)[0];
    out.push(chosen.r);
    const dk = domainKey(chosen.r);
    counts.set(dk, (counts.get(dk) ?? 0) + 1);
  }

  return [...out, ...remaining.map((x) => x.r)];
}

// web is already domain-diverse (keyword web search rarely floods one domain) — a
// high lambda only breaks a genuine flood. news (wire-flood) and discussions
// (single-platform) are the flood-prone tabs, so they diversify more aggressively.
const TAB_DIVERSITY_LAMBDA: Record<"web" | "news" | "discussions", number> = {
  web: 0.82,
  news: 0.6,
  discussions: 0.6,
};

/** Tab-tuned domain diversification of the top page (k=10). */
export function diversifyForTab(
  results: UnifiedSearchResult[],
  tab: "web" | "news" | "discussions"
): UnifiedSearchResult[] {
  return diversifyByDomain(results, { k: 10, lambda: TAB_DIVERSITY_LAMBDA[tab] });
}
