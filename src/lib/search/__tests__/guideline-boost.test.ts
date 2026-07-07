import { describe, it, expect } from "vitest";
import { planQuery } from "../query-planner";
import { promoteGuidelines, rankAndAnnotate } from "../pipeline";
import type { RankingTrace, UnifiedSearchResult } from "@/types/search";

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

function trace(over: Partial<RankingTrace>): RankingTrace {
  return {
    composite: 0,
    evidence: 0,
    citation: 0,
    velocity: 0,
    journal: 0,
    rrf: 0,
    relevance: 0,
    entityDrift: 1,
    strategy: "quality",
    ...over,
  };
}

describe("planQuery — isGuidelineLookup", () => {
  it("flags society/agency guideline lookups", () => {
    expect(planQuery("ESC guidelines for heart failure").isGuidelineLookup).toBe(true);
    expect(planQuery("KDIGO 2024 guideline for chronic kidney disease").isGuidelineLookup).toBe(true);
    expect(planQuery("epilepsy treatment guideline").isGuidelineLookup).toBe(true);
  });

  it("does NOT flag ordinary clinical questions or trial lookups", () => {
    expect(planQuery("dapagliflozin in heart failure trial").isGuidelineLookup).toBe(false);
    expect(planQuery("sglt2 inhibitors cardiovascular mortality").isGuidelineLookup).toBe(false);
  });
});

describe("promoteGuidelines", () => {
  it("floats a guideline-typed result above higher-ranked non-guidelines", () => {
    const list = [
      paper({ title: "Big RCT", studyType: "rct", citationCount: 9000 }),
      paper({ title: "Meta-analysis", studyType: "meta_analysis", citationCount: 5000 }),
      paper({ title: "2023 Society Guideline", studyType: "guideline", year: 2023 }),
    ];
    const out = promoteGuidelines(list);
    expect(out[0].title).toBe("2023 Society Guideline");
  });

  it("prefers the latest version among guidelines", () => {
    const list = [
      paper({ title: "2012 Guideline", studyType: "guideline", year: 2012 }),
      paper({ title: "2024 Guideline", studyType: "guideline", year: 2024 }),
      paper({ title: "Some review", studyType: "narrative_review" }),
    ];
    const out = promoteGuidelines(list);
    expect(out[0].title).toBe("2024 Guideline");
    expect(out[1].title).toBe("2012 Guideline");
  });

  it("preserves the relative order of non-guideline results (only raises)", () => {
    const list = [
      paper({ title: "A", studyType: "rct" }),
      paper({ title: "G", studyType: "guideline", year: 2022 }),
      paper({ title: "B", studyType: "cohort" }),
      paper({ title: "C", studyType: "meta_analysis" }),
    ];
    const out = promoteGuidelines(list).filter((r) => r.studyType !== "guideline");
    expect(out.map((r) => r.title)).toEqual(["A", "B", "C"]);
  });

  it("is a no-op when there are no guidelines", () => {
    const list = [
      paper({ title: "A", studyType: "rct" }),
      paper({ title: "B", studyType: "cohort" }),
    ];
    expect(promoteGuidelines(list).map((r) => r.title)).toEqual(["A", "B"]);
  });

  it("does NOT float an off-topic guideline that fails the relevance floor", () => {
    const list = [
      paper({
        title: "On-topic RCT",
        studyType: "rct",
        citationCount: 100,
        rankingTrace: trace({ relevance: 0.9, composite: 0.6 }),
      }),
      paper({
        title: "Off-topic guideline",
        studyType: "guideline",
        year: 2024,
        rankingTrace: trace({ relevance: 0.1, composite: 0.05 }),
      }),
    ];
    const out = promoteGuidelines(list);
    expect(out[0].title).toBe("On-topic RCT");
    expect(out.map((r) => r.title)).toEqual(["On-topic RCT", "Off-topic guideline"]);
  });

  it("does NOT float a guideline flagged with off_topic_entity drift", () => {
    const list = [
      paper({ title: "On-topic RCT", studyType: "rct" }),
      paper({
        title: "Drifted guideline",
        studyType: "guideline",
        year: 2024,
        flags: ["off_topic_entity"],
      }),
    ];
    expect(promoteGuidelines(list)[0].title).toBe("On-topic RCT");
  });

  it("still floats an on-topic guideline that clears the relevance floor", () => {
    const list = [
      paper({
        title: "Strong RCT",
        studyType: "rct",
        rankingTrace: trace({ relevance: 0.8, composite: 0.5 }),
      }),
      paper({
        title: "On-topic guideline",
        studyType: "guideline",
        year: 2024,
        rankingTrace: trace({ relevance: 0.7, composite: 0.4 }),
      }),
    ];
    expect(promoteGuidelines(list)[0].title).toBe("On-topic guideline");
  });

  it("orders promoted guidelines by composite, newest year only as tie-breaker", () => {
    const list = [
      paper({
        title: "2012 high-composite guideline",
        studyType: "guideline",
        year: 2012,
        rankingTrace: trace({ relevance: 0.9, composite: 0.7 }),
      }),
      paper({
        title: "2024 low-composite guideline",
        studyType: "guideline",
        year: 2024,
        rankingTrace: trace({ relevance: 0.9, composite: 0.3 }),
      }),
    ];
    // Higher composite wins even though it is older; year is only a tie-breaker.
    expect(promoteGuidelines(list).map((r) => r.title)).toEqual([
      "2012 high-composite guideline",
      "2024 low-composite guideline",
    ]);
  });
});

describe("rankAndAnnotate — guideline lookup integration", () => {
  it("ranks the authoritative guideline doc into the top slot for guideline queries", () => {
    const results = [
      paper({
        title: "Sacubitril/valsartan in heart failure: a randomized trial",
        studyType: "rct",
        citationCount: 12000,
        year: 2014,
      }),
      paper({
        title: "2021 ESC Guidelines for the diagnosis and treatment of heart failure",
        studyType: "guideline",
        citationCount: 8000,
        year: 2021,
      }),
    ];
    const ranked = rankAndAnnotate(results, {
      query: "ESC guidelines for heart failure",
      isGuidelineLookup: true,
    });
    expect(ranked[0].studyType).toBe("guideline");
  });
});
