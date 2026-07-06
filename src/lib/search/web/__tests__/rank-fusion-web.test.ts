import { describe, expect, it } from "vitest";
import { reciprocalRankFusionWeb } from "../rank-fusion-web";
import type { UnifiedSearchResult } from "@/types/search";

function row(url: string, title: string, source: string, extra: Partial<UnifiedSearchResult> = {}): UnifiedSearchResult {
  return {
    title,
    authors: [],
    journal: "",
    year: 0,
    url,
    sources: [source],
    citationCount: 0,
    publicationTypes: ["discussions"],
    isOpenAccess: false,
    ...extra,
  };
}

describe("reciprocalRankFusionWeb", () => {
  it("collapses URL-only rows across sources on canonical URL (where isSamePaper cannot)", () => {
    // Same page (trailing slash + www difference), no DOI/PMID/year -> academic
    // isSamePaper would treat these as distinct; canonical-URL fusion merges them.
    const a = [row("https://news.ycombinator.com/item?id=1", "Thread", "hacker-news")];
    const b = [row("http://www.news.ycombinator.com/item?id=1/", "Thread", "searxng", { engagement: "10 points" })];
    const fused = reciprocalRankFusionWeb([{ source: "hacker-news", results: a }, { source: "searxng", results: b }]);
    expect(fused).toHaveLength(1);
    expect(fused[0].sources.sort()).toEqual(["hacker-news", "searxng"]);
    expect(fused[0].engagement).toBe("10 points"); // gap-filled from the duplicate
    expect(fused[0].rrfScore).toBeGreaterThan(1 / 61); // summed across both lists
  });

  it("ranks a row appearing in two sources above a single-source row", () => {
    const a = [row("https://x.com/1", "shared", "s1"), row("https://x.com/2", "solo-a", "s1")];
    const b = [row("https://x.com/3", "solo-b", "s2"), row("https://x.com/1", "shared", "s2")];
    const fused = reciprocalRankFusionWeb([{ source: "s1", results: a }, { source: "s2", results: b }]);
    expect(fused[0].url).toBe("https://x.com/1");
  });

  it("keeps distinct URLs distinct", () => {
    const a = [row("https://a.com/1", "a", "s1")];
    const b = [row("https://b.com/1", "b", "s2")];
    const fused = reciprocalRankFusionWeb([{ source: "s1", results: a }, { source: "s2", results: b }]);
    expect(fused).toHaveLength(2);
  });

  it("down-weights a supplement source so its top row sinks below an authority engine's", () => {
    // Both sources rank their row #1. Unweighted, the tie would be broken by
    // insertion order; with weight 0.5 the supplement's row must rank lower.
    const authority = [row("https://authority.com/1", "authoritative", "engine")];
    const supplement = [row("https://supplement.com/1", "fresh", "feed")];
    const fused = reciprocalRankFusionWeb(
      [{ source: "feed", results: supplement }, { source: "engine", results: authority }],
      60,
      { feed: 0.5, engine: 1 }
    );
    expect(fused[0].url).toBe("https://authority.com/1");
    expect(fused[1].url).toBe("https://supplement.com/1");
    // The supplement's contribution is exactly halved.
    expect(fused[1].rrfScore).toBeCloseTo(0.5 / 61, 10);
  });

  it("treats a missing/default weight as 1 (unweighted behavior unchanged)", () => {
    const a = [row("https://a.com/1", "a", "s1")];
    const b = [row("https://b.com/1", "b", "s2")];
    const fused = reciprocalRankFusionWeb([{ source: "s1", results: a }, { source: "s2", results: b }], 60, {});
    expect(fused[0].rrfScore).toBeCloseTo(1 / 61, 10);
  });
});
