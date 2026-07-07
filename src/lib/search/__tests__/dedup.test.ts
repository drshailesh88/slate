import { describe, it, expect } from "vitest";
import { normalizeTitle, isSamePaper, deduplicateResults, mergeMetadata } from "../dedup";
import type { UnifiedSearchResult } from "@/types/search";

function makePaper(overrides: Partial<UnifiedSearchResult> = {}): UnifiedSearchResult {
  return {
    title: "Test Paper",
    authors: ["Author One"],
    year: 2024,
    journal: "Test Journal",
    doi: undefined,
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
    sources: ["pubmed"],
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("should lowercase and strip special characters", () => {
    expect(normalizeTitle("A Study on COVID-19: Results")).toBe(
      "a study on covid19 results"
    );
  });

  it("should collapse whitespace", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("hello world");
  });

  it("should truncate to 150 characters", () => {
    const long = "a".repeat(200);
    expect(normalizeTitle(long).length).toBe(150);
  });
});

describe("isSamePaper", () => {
  it("should match by DOI", () => {
    const a = makePaper({ doi: "10.1234/test", title: "Paper A" });
    const b = makePaper({ doi: "10.1234/TEST", title: "Paper B" });
    expect(isSamePaper(a, b)).toBe(true);
  });

  it("should match by PMID", () => {
    const a = makePaper({ pmid: "12345" });
    const b = makePaper({ pmid: "12345" });
    expect(isSamePaper(a, b)).toBe(true);
  });

  it("should match by Semantic Scholar ID", () => {
    const a = makePaper({ s2Id: "abc123" });
    const b = makePaper({ s2Id: "abc123" });
    expect(isSamePaper(a, b)).toBe(true);
  });

  it("should match by normalized title + year", () => {
    const a = makePaper({ title: "COVID-19 Treatment Study", year: 2024 });
    const b = makePaper({ title: "covid-19 treatment study", year: 2024 });
    expect(isSamePaper(a, b)).toBe(true);
  });

  it("should NOT match different titles same year", () => {
    const a = makePaper({ title: "Paper A", year: 2024 });
    const b = makePaper({ title: "Paper B", year: 2024 });
    expect(isSamePaper(a, b)).toBe(false);
  });

  it("should NOT match same title different year", () => {
    const a = makePaper({ title: "Same Title", year: 2023 });
    const b = makePaper({ title: "Same Title", year: 2024 });
    expect(isSamePaper(a, b)).toBe(false);
  });
});

describe("mergeMetadata", () => {
  it("should prefer primary fields when available", () => {
    const a = makePaper({ abstract: "Primary abstract", citationCount: 10 });
    const b = makePaper({ abstract: "Secondary abstract", citationCount: 5 });
    const merged = mergeMetadata(a, b);
    expect(merged.abstract).toBe("Primary abstract");
  });

  it("should fall back to secondary when primary is empty", () => {
    const a = makePaper({ abstract: undefined, tldr: undefined });
    const b = makePaper({ abstract: "Has abstract", tldr: "Has tldr" });
    const merged = mergeMetadata(a, b);
    expect(merged.abstract).toBe("Has abstract");
    expect(merged.tldr).toBe("Has tldr");
  });

  it("should take max citation count", () => {
    const a = makePaper({ citationCount: 5 });
    const b = makePaper({ citationCount: 15 });
    const merged = mergeMetadata(a, b);
    expect(merged.citationCount).toBe(15);
  });

  it("should merge sources without duplicates", () => {
    const a = makePaper({ sources: ["pubmed", "s2"] });
    const b = makePaper({ sources: ["s2", "openalex"] });
    const merged = mergeMetadata(a, b);
    expect(merged.sources).toEqual(["pubmed", "s2", "openalex"]);
  });
});

describe("deduplicateResults", () => {
  it("should remove exact duplicates by DOI", () => {
    const results = [
      makePaper({ doi: "10.1234/a", title: "Paper A", sources: ["pubmed"] }),
      makePaper({ doi: "10.1234/a", title: "Paper A", sources: ["s2"] }),
      makePaper({ doi: "10.5678/b", title: "Paper B", sources: ["openalex"] }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.length).toBe(2);
    expect(deduped[0].sources).toContain("pubmed");
    expect(deduped[0].sources).toContain("s2");
  });

  it("should return empty array for empty input", () => {
    expect(deduplicateResults([])).toEqual([]);
  });

  it("should keep all unique papers", () => {
    const results = [
      makePaper({ title: "A", year: 2024 }),
      makePaper({ title: "B", year: 2024 }),
      makePaper({ title: "C", year: 2024 }),
    ];
    expect(deduplicateResults(results).length).toBe(3);
  });
});
