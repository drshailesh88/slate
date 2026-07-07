import type { UnifiedSearchResult } from "@/types/search";
import { lookupPmidByDoi } from "@/lib/search/sources/pubmed";

/**
 * Max DOI→PMID lookups per query. The shown page is small and OpenAlex already
 * filled most PMIDs, so a handful of NCBI calls closes the residual gap without
 * draining the shared eutils rate budget.
 */
export const PMID_BACKFILL_CAP = 8;

/**
 * Unique DOIs (in pool order) of results that have a DOI but no PMID, up to `cap`.
 * Pool order is RRF-ranked, so the cap keeps the lookups on the top candidates.
 */
export function selectDoisNeedingPmid(
  results: readonly { doi?: string; pmid?: string }[],
  cap: number = PMID_BACKFILL_CAP
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of results) {
    if (out.length >= cap) break;
    if (r.pmid || !r.doi) continue;
    const key = r.doi.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.doi);
  }
  return out;
}

interface BackfillDeps {
  /** DOI→PMID resolver; defaults to the NCBI esearch[AID] lookup. Injectable for tests. */
  lookup?: (doi: string) => Promise<string | null>;
  cap?: number;
}

/**
 * Backfill PMIDs on DOI-only results via NCBI esearch[AID] — the residual that
 * OpenAlex's id graph could not map (the PMID metadata gate). Mutates results in
 * place and returns the count filled. Bounded by `cap`, deduped so a shared DOI
 * costs one call, and fail-open per DOI (a miss/throw leaves the result
 * unchanged). Additive metadata only — never reorders, drops, or overwrites an
 * existing PMID.
 */
export async function backfillPmidsByDoi(
  results: UnifiedSearchResult[],
  deps: BackfillDeps = {}
): Promise<number> {
  const lookup = deps.lookup ?? lookupPmidByDoi;
  const dois = selectDoisNeedingPmid(results, deps.cap ?? PMID_BACKFILL_CAP);
  if (dois.length === 0) return 0;

  const resolved = await Promise.all(
    dois.map(async (doi) => {
      try {
        return [doi.toLowerCase(), await lookup(doi)] as const;
      } catch {
        return [doi.toLowerCase(), null] as const;
      }
    })
  );
  const map = new Map(
    resolved.filter((e): e is readonly [string, string] => Boolean(e[1]))
  );
  if (map.size === 0) return 0;

  let filled = 0;
  for (const r of results) {
    if (r.pmid || !r.doi) continue;
    const pmid = map.get(r.doi.toLowerCase());
    if (pmid) {
      r.pmid = pmid;
      filled++;
    }
  }
  return filled;
}
