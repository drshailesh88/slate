import { describe, it, expect } from "vitest";
import { rankAndAnnotate } from "../pipeline";
import { recencyYearFloor } from "../run-search";
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

describe("rankAndAnnotate — recency intent prefers newer PIVOTAL evidence", () => {
  it("ranks a newer pivotal trial above an older, more-cited established trial", () => {
    // The recency-loss case: an older landmark has accumulated far more citations,
    // but the user explicitly asked for the latest evidence and the newer trial is
    // itself high quality (same evidence tier, strong journal, strong relevance).
    const olderEstablished = paper({
      title: "Semaglutide cardiovascular outcomes (2019 landmark)",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2019,
      citationCount: 9000,
      journal: "N Engl J Med",
      journalQuartile: "Q1",
      rerankScore: 0.78,
    });
    const newerPivotal = paper({
      title: "Semaglutide cardiovascular outcomes (2025 trial)",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2025,
      citationCount: 600,
      journal: "N Engl J Med",
      journalQuartile: "Q1",
      rerankScore: 0.75,
    });
    const ranked = rankAndAnnotate([olderEstablished, newerPivotal], {
      query: "latest semaglutide cardiovascular outcomes 2025",
      recency: true,
    });
    expect(ranked[0].year).toBe(2025);
  });

  it("still keeps a high-quality landmark above newer LOW-value noise (guard)", () => {
    const landmark = paper({
      title: "Landmark trial of drug X",
      studyType: "rct",
      evidenceLevel: "II",
      year: 2022,
      citationCount: 4000,
      journal: "NEJM",
      journalQuartile: "Q1",
      rerankScore: 0.9,
    });
    const newerNoise = paper({
      title: "Minor commentary mentioning drug X",
      studyType: "other",
      evidenceLevel: "V",
      year: 2026,
      citationCount: 1,
      rerankScore: 0.2,
    });
    const ranked = rankAndAnnotate([newerNoise, landmark], {
      query: "latest drug X",
      recency: true,
    });
    expect(ranked[0].title).toBe("Landmark trial of drug X");
  });
});

describe("recencyYearFloor — recency-windowed dense lane", () => {
  it("covers the last N calendar years inclusive", () => {
    // 2026 with a 3-year window → 2024, so the lane spans 2024/2025/2026.
    expect(recencyYearFloor(2026, 3)).toBe(2024);
  });

  it("a 1-year window is the current year only", () => {
    expect(recencyYearFloor(2026, 1)).toBe(2026);
  });
});
