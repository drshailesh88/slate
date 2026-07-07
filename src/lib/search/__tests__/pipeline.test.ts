import { describe, it, expect } from "vitest";
import {
  rankAndAnnotate,
  buildFlags,
  buildWhyRelevant,
  recencyRankKey,
  exactTitleMatchIndex,
} from "../pipeline";
import type { UnifiedSearchResult } from "@/types/search";

function paper(p: Partial<UnifiedSearchResult>): UnifiedSearchResult {
  return {
    title: "Untitled",
    authors: [],
    journal: "",
    year: 2020,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: ["pubmed"],
    ...p,
  };
}

describe("recencyRankKey", () => {
  const Y0 = 2022;
  const Y1 = 2026;
  const span = Y1 - Y0;

  it("keeps a high-quality landmark above recent low-value papers", () => {
    // A pivotal trial (high composite, oldest year) must NOT be buried by a
    // stream of recent but low-composite papers — recency amplifies quality, it
    // does not substitute for it.
    const landmark = recencyRankKey(0.83, Y0, Y0, span);
    const recentNoise = recencyRankKey(0.5, Y1, Y0, span);
    expect(landmark).toBeGreaterThan(recentNoise);
  });

  it("prefers the newer of two equally-strong papers", () => {
    expect(recencyRankKey(0.6, Y1, Y0, span)).toBeGreaterThan(
      recencyRankKey(0.6, Y0, Y0, span)
    );
  });

  it("lets a clearly stronger recent paper outrank an older weaker one", () => {
    expect(recencyRankKey(0.7, Y1, Y0, span)).toBeGreaterThan(
      recencyRankKey(0.55, Y0, Y0, span)
    );
  });

  it("returns the composite unchanged when all papers share a year (zero span)", () => {
    expect(recencyRankKey(0.42, 2025, 2025, 0)).toBe(0.42);
  });
});

describe("rankAndAnnotate recency ordering", () => {
  it("does not bury a pivotal high-citation RCT under recent low-evidence papers", () => {
    const landmark = paper({
      title: "Lecanemab in Early Alzheimer's Disease",
      year: 2023,
      studyType: "Randomized Controlled Trial",
      citationCount: 5000,
      rerankScore: 0.8,
      pmid: "36449413",
    });
    const recentNoise = [2026, 2026, 2026, 2026, 2026].map((y, i) =>
      paper({
        title: `Recent real-world lecanemab imaging substudy ${i}`,
        year: y,
        studyType: "other",
        citationCount: 0,
        rerankScore: 0.5,
        pmid: `9000${i}`,
      })
    );

    const ranked = rankAndAnnotate([...recentNoise, landmark], {
      query: "newest evidence on lecanemab for Alzheimer disease",
      recency: true,
    });

    expect(ranked[0].pmid).toBe("36449413");
  });
});

describe("exactTitleMatchIndex", () => {
  const EXACT_QUERY =
    "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction";

  it("finds the verbatim-title paper among related results", () => {
    const results = [
      paper({ title: "Dapagliflozin in heart failure: a systematic review and meta-analysis" }),
      paper({ title: "SGLT2 inhibitors and renal outcomes in type 2 diabetes" }),
      paper({ title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction" }),
    ];
    expect(exactTitleMatchIndex(results, EXACT_QUERY)).toBe(2);
  });

  it("does not match a longer review that merely contains all query tokens", () => {
    const results = [
      paper({
        title:
          "Dapagliflozin in patients with heart failure and reduced ejection fraction: mechanisms, pivotal trials, and future directions for clinical practice",
      }),
    ];
    expect(exactTitleMatchIndex(results, EXACT_QUERY)).toBe(-1);
  });

  it("returns -1 for a PICO question (not a title lookup)", () => {
    const results = [paper({ title: "SGLT2 inhibitors and cardiovascular mortality" })];
    expect(
      exactTitleMatchIndex(
        results,
        "In adults with type 2 diabetes, do SGLT2 inhibitors reduce cardiovascular mortality?"
      )
    ).toBe(-1);
  });

  it("returns -1 for a short keyword / acronym query", () => {
    const results = [paper({ title: "DAPA-HF trial primary results" })];
    expect(exactTitleMatchIndex(results, "DAPA-HF trial")).toBe(-1);
  });

  it("returns -1 when no title is a near-exact match (broad query)", () => {
    const results = [
      paper({ title: "2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure" }),
    ];
    expect(
      exactTitleMatchIndex(results, "management of heart failure with reduced ejection fraction")
    ).toBe(-1);
  });
});

describe("rankAndAnnotate exact-title boosting", () => {
  it("floats the verbatim-title paper to #1 even when its composite ranks it lower", () => {
    const exact = paper({
      title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
      year: 2019,
      studyType: "rct",
      citationCount: 50,
      rerankScore: 0.6,
      pmid: "31535829",
    });
    const louderRelated = [1, 2, 3, 4, 5].map((i) =>
      paper({
        title: `Dapagliflozin meta-analysis number ${i} in heart failure`,
        year: 2024,
        studyType: "meta_analysis",
        citationCount: 4000,
        rerankScore: 0.7,
        pmid: `7770${i}`,
      })
    );
    const ranked = rankAndAnnotate([...louderRelated, exact], {
      query: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
    });
    expect(ranked[0].pmid).toBe("31535829");
  });
});

describe("rankAndAnnotate rerank-window boundary (Lever 1 / F2)", () => {
  it("keeps a reranked (model-scored) paper above an un-reranked lexical match", () => {
    // F2: today only the top of the pool is reranked, so a candidate PAST the
    // rerank depth falls back to keyword-overlap relevance, which SATURATES (~1.0)
    // on a couple of shared distinctive words and out-sorts a calibrated
    // cross-encoder score (0.4–0.7). The fix: any candidate the reranker scored
    // (a model rerankScore) sorts strictly ABOVE any candidate it did not — never
    // interleaved by raw composite.
    const query = "empagliflozin cardiovascular outcomes heart failure";
    const reranked = paper({
      title: "Empagliflozin outcome trial in heart failure",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2020,
      citationCount: 100,
      rerankScore: 0.55, // calibrated model relevance
      rrfScore: 0.02,
      pmid: "RERANKED",
    });
    const lexicalTail = paper({
      title:
        "Empagliflozin cardiovascular outcomes heart failure: a narrative overview",
      studyType: "narrative_review",
      evidenceLevel: "III",
      year: 2021,
      citationCount: 200,
      // no rerankScore → un-reranked tail; lexical overlap saturates on the
      // shared distinctive tokens (empagliflozin, cardiovascular, heart, failure).
      rrfScore: 0.02,
      pmid: "LEXICAL",
    });
    const ranked = rankAndAnnotate([lexicalTail, reranked], { query });
    expect(ranked[0].pmid).toBe("RERANKED");
  });

  it("is a no-op when no candidate was reranked (fail-open lexical floor preserved)", () => {
    // With the reranker absent (or skipped), NO candidate carries a model score,
    // so the boundary must not reorder — the lexical composite alone decides.
    const strong = paper({
      title: "Dapagliflozin in heart failure with reduced ejection fraction",
      studyType: "rct",
      evidenceLevel: "II",
      citationCount: 5000,
      journal: "N Engl J Med",
      rrfScore: 0.03,
      pmid: "STRONG",
    });
    const weak = paper({
      title: "An unrelated case report",
      studyType: "case_report",
      evidenceLevel: "IV",
      citationCount: 0,
      rrfScore: 0.01,
      pmid: "WEAK",
    });
    const ranked = rankAndAnnotate([weak, strong], {
      query: "dapagliflozin heart failure reduced ejection fraction",
    });
    expect(ranked[0].pmid).toBe("STRONG");
  });
});

describe("buildFlags", () => {
  it("flags missing metadata, never fabricates it", () => {
    const flags = buildFlags(paper({ title: "x", doi: undefined, pmid: undefined, citationCount: 0 }));
    expect(flags).toContain("missing_doi");
    expect(flags).toContain("missing_pmid");
    expect(flags).toContain("missing_citation_count");
  });
  it("omits flags for present fields", () => {
    const flags = buildFlags(
      paper({
        title: "x",
        doi: "10.1/x",
        pmid: "1",
        year: 2021,
        journal: "NEJM",
        citationCount: 10,
        journalQuartile: "Q1",
        studyType: "rct",
        abstract: "abc",
      })
    );
    expect(flags).not.toContain("missing_doi");
    expect(flags).not.toContain("unrated_journal");
    expect(flags).not.toContain("unclassified_study_type");
  });
});

describe("buildWhyRelevant", () => {
  it("summarizes evidence, year, citations and matched terms deterministically", () => {
    const why = buildWhyRelevant(
      paper({ studyType: "meta_analysis", evidenceLevel: "I", year: 2024, citationCount: 150, journalQuartile: "Q1" }),
      ["sglt2", "heart failure"]
    );
    expect(why).toContain("Level I");
    expect(why).toContain("2024");
    expect(why).toContain("150 citations");
    expect(why).toContain("matches: sglt2, heart failure");
  });
});

describe("rankAndAnnotate", () => {
  const landmarkRct = paper({
    title: "Dapagliflozin in heart failure with reduced ejection fraction",
    studyType: "rct",
    evidenceLevel: "II",
    year: 2019,
    citationCount: 5000,
    journal: "N Engl J Med",
    rrfScore: 0.02,
  });
  const obscureCaseReport = paper({
    title: "A case report of an unrelated finding",
    studyType: "case_report",
    evidenceLevel: "IV",
    year: 2025,
    citationCount: 0,
    rrfScore: 0.02,
  });

  it("ranks the high-evidence, high-citation landmark above a recent case report", () => {
    const ranked = rankAndAnnotate([obscureCaseReport, landmarkRct], {
      query: "dapagliflozin heart failure reduced ejection fraction",
    });
    expect(ranked[0].title).toContain("Dapagliflozin");
    expect(ranked[0].rankingTrace?.strategy).toBe("quality");
    expect(ranked[0].rankingTrace?.composite).toBeGreaterThan(ranked[1].rankingTrace!.composite);
    expect(ranked[0].whyRelevant).toBeTruthy();
    expect(ranked[0].flags).toBeDefined();
  });

  it("recency strategy orders comparable-quality papers newest-first and labels the trace", () => {
    // Recency orders papers of SIMILAR quality newest-first — but it must not let
    // a newer low-value item leapfrog a far-higher-quality landmark (covered by
    // the landmark-preservation test below). Here both peers are equally strong,
    // so the newer one wins.
    const olderPeer = paper({
      title: "Dapagliflozin trial (earlier report)",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2020,
      citationCount: 1000,
      journal: "N Engl J Med",
      rrfScore: 0.02,
    });
    const newerPeer = paper({
      title: "Dapagliflozin trial (later report)",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2024,
      citationCount: 1000,
      journal: "N Engl J Med",
      rrfScore: 0.02,
    });
    const ranked = rankAndAnnotate([olderPeer, newerPeer], {
      query: "latest dapagliflozin",
      recency: true,
    });
    expect(ranked[0].year).toBe(2024);
    expect(ranked[0].rankingTrace?.strategy).toBe("recency");
  });

  it("returns [] for empty input", () => {
    expect(rankAndAnnotate([], { query: "x" })).toEqual([]);
  });

  it("uses rerankScore as the dominant relevance signal when present", () => {
    const base = {
      studyType: "rct" as const,
      evidenceLevel: "II" as const,
      year: 2020,
      citationCount: 100,
      journal: "NEJM",
      rrfScore: 0.02,
    };
    const semanticallyTop = paper({ ...base, title: "Highly relevant paper", rerankScore: 0.95 });
    const semanticallyWeak = paper({ ...base, title: "Barely relevant paper", rerankScore: 0.05 });
    const ranked = rankAndAnnotate([semanticallyWeak, semanticallyTop], { query: "anything" });
    expect(ranked[0].title).toBe("Highly relevant paper");
    expect(ranked[0].rankingTrace?.relevance).toBeCloseTo(0.95, 2);
    // velocity signal is computed and surfaced in the trace
    expect(typeof ranked[0].rankingTrace?.velocity).toBe("number");
  });

  it("recency blend keeps a high-quality landmark above a newer low-value item", () => {
    const landmark = paper({
      title: "Landmark trial of drug X",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2022,
      citationCount: 4000,
      journal: "NEJM",
      journalQuartile: "Q1",
      rerankScore: 0.9,
      rrfScore: 0.03,
    });
    const newerNoise = paper({
      title: "Minor commentary mentioning drug X",
      studyType: "other",
      evidenceLevel: "V",
      year: 2026,
      citationCount: 1,
      rerankScore: 0.2,
      rrfScore: 0.01,
    });
    const ranked = rankAndAnnotate([newerNoise, landmark], { query: "latest drug X", recency: true });
    expect(ranked[0].title).toBe("Landmark trial of drug X");
    expect(ranked[0].rankingTrace?.strategy).toBe("recency");
  });

  it("flags and demotes retracted papers below clean ones, without dropping them", () => {
    const retractedHighScore = paper({
      title: "Retracted landmark on dapagliflozin heart failure",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2019,
      citationCount: 9000,
      journal: "N Engl J Med",
      publicationTypes: ["Retracted Publication"],
      rrfScore: 0.05,
    });
    const cleanLowScore = paper({
      title: "A modest cohort on dapagliflozin heart failure",
      studyType: "cohort",
      evidenceLevel: "III",
      year: 2018,
      citationCount: 5,
      rrfScore: 0.01,
    });
    const ranked = rankAndAnnotate([retractedHighScore, cleanLowScore], {
      query: "dapagliflozin heart failure",
    });
    expect(ranked).toHaveLength(2); // not dropped
    expect(ranked[0].title).toContain("modest cohort"); // clean paper ranks above the retracted one
    expect(ranked[1].flags).toContain("retracted");
  });
});
