import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "../rank-fusion";
import type { UnifiedSearchResult } from "@/types/search";

function makePaper(title: string, doi?: string): UnifiedSearchResult {
  return {
    title,
    authors: [],
    year: 2024,
    journal: "J",
    doi,
    pmid: undefined,
    s2Id: undefined,
    openalexId: undefined,
    abstract: undefined,
    tldr: undefined,
    citationCount: 0,
    influentialCitationCount: undefined,
    referenceCount: undefined,
    studyType: undefined,
    evidenceLevel: undefined,
    publicationTypes: [],
    fieldsOfStudy: [],
    meshTerms: [],
    concepts: [],
    isOpenAccess: false,
    openAccessPdfUrl: undefined,
    sources: [],
  };
}

describe("reciprocalRankFusion", () => {
  it("should return empty array for no inputs", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });

  it("should return all results from a single source", () => {
    const results = reciprocalRankFusion([
      {
        source: "pubmed",
        results: [makePaper("A"), makePaper("B"), makePaper("C")],
      },
    ]);
    expect(results.length).toBe(3);
    expect(results[0].title).toBe("A"); // highest rank
  });

  it("should merge duplicate papers across sources", () => {
    const results = reciprocalRankFusion([
      { source: "pubmed", results: [makePaper("Same Paper", "10.1/a")] },
      { source: "s2", results: [makePaper("Same Paper", "10.1/a")] },
    ]);
    expect(results.length).toBe(1);
    expect(results[0].sources).toContain("pubmed");
    expect(results[0].sources).toContain("s2");
  });

  it("should rank papers found in multiple sources higher", () => {
    const sharedPaper = makePaper("Shared", "10.1/shared");
    const onlyPubmed = makePaper("Only PubMed", "10.1/pm");
    const onlyS2 = makePaper("Only S2", "10.1/s2");

    const results = reciprocalRankFusion([
      { source: "pubmed", results: [onlyPubmed, sharedPaper] },
      { source: "s2", results: [sharedPaper, onlyS2] },
    ]);

    // Shared paper should have higher RRF score
    expect(results[0].title).toBe("Shared");
  });

  it("should use k parameter in scoring", () => {
    const results = reciprocalRankFusion(
      [{ source: "test", results: [makePaper("A"), makePaper("B")] }],
      60
    );
    // First paper: 1/(60+0+1) = 1/61
    // Second paper: 1/(60+1+1) = 1/62
    expect(results[0].rrfScore).toBeCloseTo(1 / 61, 5);
    expect(results[1].rrfScore).toBeCloseTo(1 / 62, 5);
  });
});
