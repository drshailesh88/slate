import type { UnifiedSearchResult } from "@/types/search";
import { isSamePaper, mergeMetadata } from "./dedup";

interface SourceList {
  source: string;
  results: UnifiedSearchResult[];
}

export function reciprocalRankFusion(
  resultLists: SourceList[],
  k: number = 60
): UnifiedSearchResult[] {
  // Map to track merged results by their index in the output array
  const merged: UnifiedSearchResult[] = [];
  const scores: number[] = [];

  for (const { source, results } of resultLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const paper = results[rank];
      const rrfContribution = 1 / (k + rank + 1);

      // Find if this paper already exists in merged results
      const existingIdx = merged.findIndex((m) => isSamePaper(m, paper));

      if (existingIdx >= 0) {
        // Paper exists — add RRF score and merge metadata
        scores[existingIdx] += rrfContribution;
        merged[existingIdx] = mergeMetadata(merged[existingIdx], paper);
        if (!merged[existingIdx].sources.includes(source)) {
          merged[existingIdx].sources.push(source);
        }
      } else {
        // New paper
        merged.push({
          ...paper,
          sources: paper.sources.includes(source)
            ? [...paper.sources]
            : [...paper.sources, source],
        });
        scores.push(rrfContribution);
      }
    }
  }

  // Sort by RRF score descending
  const indexed = merged.map((result, i) => ({ result, score: scores[i] }));
  indexed.sort((a, b) => b.score - a.score);

  return indexed.map(({ result, score }) => ({
    ...result,
    rrfScore: score,
  }));
}
