/**
 * Neighbour / citation expansion — a corpus-free recall booster.
 *
 * Given the top seed papers from the first retrieval wave, pull PubMed's
 * pre-computed "related articles" (PMRA, via `elink` cmd=neighbor) and hydrate
 * them into full results. A landmark a query never lexically matches is, by
 * definition, related to the papers that DO match it (e.g. PARTNER 3 is a PMRA
 * neighbour of the TAVR low-risk papers). This uses the citation/relatedness
 * structure NCBI already maintains — no embeddings, no corpus, no index.
 *
 * Fail-open: returns [] on any error. Results are tagged source "pubmed_pmra"
 * so the retrieval path stays traceable.
 */

import type { UnifiedSearchResult } from "@/types/search";
import { fetchPubMedByPmids } from "@/lib/search/sources/pubmed";
import { resilientFetch } from "@/lib/http/resilient-fetch";

interface ELinkResponse {
  linksets?: {
    linksetdbs?: { linkname?: string; links?: (string | number)[] }[];
  }[];
}

export async function expandByPmra(
  seedPmids: string[],
  options: { limit?: number; maxSeeds?: number } = {}
): Promise<UnifiedSearchResult[]> {
  const seeds = [...new Set(seedPmids.filter(Boolean))].slice(0, options.maxSeeds ?? 10);
  if (seeds.length === 0) return [];
  const limit = options.limit ?? 25;

  const idParams = seeds.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pubmed&${idParams}&linkname=pubmed_pubmed&cmd=neighbor&retmode=json&tool=scholarsync&email=contact@scholarsync.com`;

  let neighborPmids: string[] = [];
  try {
    const res = await resilientFetch(url, {}, { service: "PubMed", timeout: 12000, baseDelay: 400 });
    const data: ELinkResponse = await res.json();
    const seedSet = new Set(seeds);
    const tally = new Map<string, number>();
    for (const ls of data.linksets ?? []) {
      for (const db of ls.linksetdbs ?? []) {
        if (db.linkname !== "pubmed_pubmed") continue;
        for (const id of db.links ?? []) {
          const s = String(id);
          if (seedSet.has(s)) continue;
          tally.set(s, (tally.get(s) ?? 0) + 1);
        }
      }
    }
    // Prefer neighbours related to MORE seeds (bibliographic-coupling-like signal).
    neighborPmids = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  } catch {
    return [];
  }

  if (neighborPmids.length === 0) return [];
  const results = await fetchPubMedByPmids(neighborPmids);
  return results.map((r) => ({ ...r, sources: ["pubmed_pmra"] }));
}
