/**
 * Tests for domain-aware search pipeline functions.
 *
 * Verifies backward compatibility: medicine domain produces identical results
 * to the existing hardcoded functions.
 */

import { describe, it, expect } from "vitest";
import { expandQuery, expandQueryForDomain } from "../query-expander";
import { detectStudyType, detectStudyTypeForDomain } from "../study-type-detector";
import { medicineDomain } from "../domains/medicine";
import { multidisciplinaryDomain } from "../domains/multidisciplinary";

// ── expandQueryForDomain ──────────────────────────────────────────

describe("expandQueryForDomain", () => {
  it("returns same expansions as expandQuery for medicine domain SGLT2 query", () => {
    const baseline = expandQuery("SGLT2 inhibitors in heart failure");
    const domainResult = expandQueryForDomain("SGLT2 inhibitors in heart failure", medicineDomain);

    // Both should find SGLT2 and heart failure expansions
    expect(domainResult.expansions.length).toBe(baseline.expansions.length);
    expect(domainResult.supplementary).not.toBeNull();
    expect(baseline.supplementary).not.toBeNull();

    // Same synonym sets
    const baselineSynonyms = baseline.expansions.flatMap((e) => e.synonyms).sort();
    const domainSynonyms = domainResult.expansions.flatMap((e) => e.synonyms).sort();
    expect(domainSynonyms).toEqual(baselineSynonyms);
  });

  it("returns no expansions for multidisciplinary domain (empty synonym map)", () => {
    const result = expandQueryForDomain("SGLT2 inhibitors in heart failure", multidisciplinaryDomain);
    expect(result.expansions).toEqual([]);
    expect(result.supplementary).toBeNull();
    expect(result.original).toBe("SGLT2 inhibitors in heart failure");
  });

  it("falls back to existing expandQuery when domain is undefined", () => {
    const baseline = expandQuery("quantum physics entanglement");
    const result = expandQueryForDomain("quantum physics entanglement", undefined);

    expect(result.original).toBe(baseline.original);
    expect(result.supplementary).toBe(baseline.supplementary);
    expect(result.expansions).toEqual(baseline.expansions);
  });
});

// ── detectStudyTypeForDomain ──────────────────────────────────────

describe("detectStudyTypeForDomain", () => {
  it("detects RCT via medicine domain (falls back to hardcoded — empty studyTypePatterns)", () => {
    const result = detectStudyTypeForDomain(
      "A randomized controlled trial of empagliflozin",
      "",
      medicineDomain
    );
    // medicineDomain.studyTypePatterns is empty, so it falls back to detectStudyType
    const baseline = detectStudyType("A randomized controlled trial of empagliflozin", "");
    expect(result).toBe(baseline ?? "other");
  });

  it("returns 'other' for multidisciplinary domain (empty patterns)", () => {
    const result = detectStudyTypeForDomain(
      "some title about quantum mechanics",
      "",
      multidisciplinaryDomain
    );
    expect(result).toBe("other");
  });

  it("falls back to hardcoded detection when domain is undefined", () => {
    const result = detectStudyTypeForDomain(
      "A systematic review of treatments",
      undefined,
      undefined
    );
    expect(result).toBe("systematic_review");
  });

  it("returns 'other' when no match in hardcoded patterns and no domain", () => {
    const result = detectStudyTypeForDomain(
      "An investigation of thermal properties",
      undefined,
      undefined
    );
    expect(result).toBe("other");
  });
});

// ── FilterPanel data logic ────────────────────────────────────────

describe("FilterPanel domain data", () => {
  it("medicine config provides expected filter options", () => {
    expect(medicineDomain.filterOptions.length).toBeGreaterThan(0);
    const values = medicineDomain.filterOptions.map((o) => o.value);
    expect(values).toContain("rct");
    expect(values).toContain("meta_analysis");
    expect(values).toContain("systematic_review");
    expect(values).toContain("guideline");
  });

  it("multidisciplinary config provides different filter options", () => {
    expect(multidisciplinaryDomain.filterOptions.length).toBeGreaterThan(0);
    const values = multidisciplinaryDomain.filterOptions.map((o) => o.value);
    expect(values).toContain("journal_article");
    expect(values).toContain("conference_paper");
    expect(values).toContain("preprint");
    // Should NOT contain medicine-specific types
    expect(values).not.toContain("rct");
    expect(values).not.toContain("cohort");
  });

  it("medicine config provides correct source list", () => {
    expect(medicineDomain.sources).toEqual(["pubmed", "europepmc"]);
  });

  it("multidisciplinary config provides correct source list", () => {
    expect(multidisciplinaryDomain.sources).toEqual(["pubmed", "europepmc"]);
  });
});
