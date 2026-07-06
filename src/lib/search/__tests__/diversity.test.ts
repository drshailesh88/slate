import { describe, it, expect } from "vitest";
import type { UnifiedSearchResult } from "@/types/search";
import { titleSimilarity, diversifyTopK, diversifyByDomain, diversifyForTab } from "../diversity";

function paper(title: string, over: Partial<UnifiedSearchResult> = {}): UnifiedSearchResult {
  return {
    title,
    authors: [],
    journal: "",
    year: 2024,
    citationCount: 0,
    sources: ["pubmed"],
    ...over,
  } as UnifiedSearchResult;
}

describe("titleSimilarity — Jaccard over title tokens", () => {
  it("is 1 for identical titles and 0 for disjoint titles", () => {
    expect(titleSimilarity(paper("SGLT2 inhibitors in heart failure"), paper("SGLT2 inhibitors in heart failure"))).toBe(1);
    expect(titleSimilarity(paper("apples oranges bananas"), paper("quantum chromodynamics lattice"))).toBe(0);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const s = titleSimilarity(
      paper("dapagliflozin in heart failure with reduced ejection fraction"),
      paper("empagliflozin in heart failure with preserved ejection fraction")
    );
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("ignores case and punctuation", () => {
    expect(
      titleSimilarity(paper("Heart Failure: A Review."), paper("heart failure a review"))
    ).toBe(1);
  });
});

describe("diversifyTopK — MMR reorder within the fixed top-K", () => {
  it("pins the #1 anchor in place", () => {
    const input = [paper("Anchor landmark"), paper("Anchor landmark twin"), paper("Distinct topic")];
    const out = diversifyTopK(input, { k: 3, anchor: 1, lambda: 0.5 });
    expect(out[0].title).toBe("Anchor landmark");
  });

  it("preserves the exact SET of the top-K (only the order changes) so recall@k cannot regress", () => {
    const input = [
      paper("A one"),
      paper("A one variant"),
      paper("B two"),
      paper("C three"),
      paper("D four tail"),
    ];
    const out = diversifyTopK(input, { k: 4, anchor: 1, lambda: 0.5 });
    const topBefore = new Set(input.slice(0, 4).map((p) => p.title));
    const topAfter = new Set(out.slice(0, 4).map((p) => p.title));
    expect(topAfter).toEqual(topBefore);
    // tail untouched
    expect(out[4].title).toBe("D four tail");
  });

  it("spreads a near-duplicate down so a distinct paper surfaces above it", () => {
    // Ranked order puts a near-twin of the anchor at position 2 and a distinct
    // paper at position 3. MMR should promote the distinct paper above the twin.
    const input = [
      paper("statin therapy primary prevention cardiovascular"),
      paper("statin therapy primary prevention cardiovascular disease"), // near-twin of #1
      paper("aspirin bleeding risk elderly"), // distinct
    ];
    const out = diversifyTopK(input, { k: 3, anchor: 1, lambda: 0.5 });
    expect(out.map((p) => p.title)).toEqual([
      "statin therapy primary prevention cardiovascular",
      "aspirin bleeding risk elderly",
      "statin therapy primary prevention cardiovascular disease",
    ]);
  });

  it("is a no-op when there is nothing to diversify (length <= anchor+1)", () => {
    const input = [paper("only"), paper("two")];
    expect(diversifyTopK(input, { k: 10, anchor: 1 })).toBe(input);
  });

  it("leaves order unchanged when all candidates are mutually distinct", () => {
    const input = [paper("alpha beta"), paper("gamma delta"), paper("epsilon zeta"), paper("eta theta")];
    const out = diversifyTopK(input, { k: 4, anchor: 1, lambda: 0.7 });
    expect(out.map((p) => p.title)).toEqual(input.map((p) => p.title));
  });
});

describe("diversifyByDomain — domain-aware top-K selection (MMR)", () => {
  const d = (title: string, domain: string) =>
    paper(title, { domain, url: `https://${domain}/${title}` });

  it("promotes a distinct-domain result into the top-K over a redundant same-domain one", () => {
    const results = [d("a", "news.com"), d("b", "news.com"), d("c", "news.com"), d("x", "other.com")];
    const out = diversifyByDomain(results, { k: 3, lambda: 0.7 });
    const topDomains = out.slice(0, 3).map((r) => r.domain);
    expect(new Set(topDomains).size).toBe(2); // was 1 unique (all news.com)
    expect(topDomains).toContain("other.com"); // x pulled up from rank 4
  });

  it("leaves an all-distinct-domain list in its original order", () => {
    const results = [d("a", "a.com"), d("b", "b.com"), d("c", "c.com")];
    const out = diversifyByDomain(results, { k: 3, lambda: 0.7 });
    expect(out.map((r) => r.title)).toEqual(["a", "b", "c"]);
  });

  it("pins the anchor and never drops a result", () => {
    const results = [d("a", "x.com"), d("b", "x.com"), d("c", "y.com"), d("e", "z.com")];
    const out = diversifyByDomain(results, { k: 3, lambda: 0.7, anchor: 1 });
    expect(out[0].title).toBe("a"); // anchor pinned
    expect(out).toHaveLength(4); // nothing dropped
    expect(new Set(out.map((r) => r.title)).size).toBe(4);
  });

  it("lambda=1 (pure relevance) keeps the original order", () => {
    const results = [d("a", "x.com"), d("b", "x.com"), d("c", "y.com")];
    const out = diversifyByDomain(results, { k: 3, lambda: 1 });
    expect(out.map((r) => r.title)).toEqual(["a", "b", "c"]);
  });
});

describe("diversifyForTab", () => {
  const d = (title: string, domain: string) =>
    paper(title, { domain, url: `https://${domain}/${title}` });

  it("breaks a single-outlet news flood by surfacing a distinct domain into the top page", () => {
    // 12 from one wire + 1 distinct outlet deeper than the page — diversification
    // should pull the distinct outlet into the top 10.
    const flood = Array.from({ length: 12 }, (_, i) => d(`n${i}`, "reuters.com"));
    const results = [...flood, d("distinct", "apnews.com")];
    const out = diversifyForTab(results, "news");
    const top = out.slice(0, 10);
    expect(top.some((r) => r.domain === "apnews.com")).toBe(true);
    expect(out).toHaveLength(13); // nothing dropped
  });
});
