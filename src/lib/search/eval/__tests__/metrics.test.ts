import { describe, it, expect } from "vitest";
import {
  matchesMustHave,
  firstMatchRank,
  recallAtK,
  bestMustHaveRank,
  meanReciprocalRank,
  ndcgAtK,
  doiFillRate,
  pmidFillRate,
  duplicateRate,
  caseReportRate,
  lexicalCoverage,
  normalizeDoi,
  computeQueryMetrics,
  meanOf,
  type EvalResultItem,
} from "../metrics";

const partner3: EvalResultItem = {
  title: "Transcatheter Aortic-Valve Replacement with a Balloon-Expandable Valve in Low-Risk Patients",
  doi: "10.1056/NEJMoa1814052",
  pmid: "30883058",
  year: 2019,
  journal: "N Engl J Med",
  studyType: "rct",
};
const caseReport: EvalResultItem = {
  title: "Recurrent strokes after TAVR: a case report",
  pmid: "39707208",
  year: 2024,
  journal: "BMC Cardiovasc Disord",
  studyType: "case_report",
};
const evolut6yr: EvalResultItem = {
  title: "Six-Year Outcomes After Transcatheter vs Surgical Aortic Valve Replacement in Low-Risk Patients",
  doi: "10.1016/j.jacc.2026.02.5063",
  pmid: "41697183",
  year: 2026,
  journal: "J Am Coll Cardiol",
  studyType: "rct",
};

describe("normalizeDoi", () => {
  it("strips resolver prefix and lowercases", () => {
    expect(normalizeDoi("https://doi.org/10.1056/NEJMoa1814052")).toBe(
      "10.1056/nejmoa1814052"
    );
    expect(normalizeDoi("https://dx.doi.org/10.X/Y")).toBe("10.x/y");
    expect(normalizeDoi(undefined)).toBeUndefined();
  });
});

describe("matchesMustHave", () => {
  it("matches on PMID", () => {
    expect(matchesMustHave(partner3, { pmids: ["30883058"] })).toBe(true);
    expect(matchesMustHave(caseReport, { pmids: ["30883058"] })).toBe(false);
  });
  it("matches on DOI regardless of resolver/casing", () => {
    expect(matchesMustHave(partner3, { dois: ["https://doi.org/10.1056/nejmoa1814052"] })).toBe(true);
  });
  it("requires all tokens of a multi-token titleIncludes entry", () => {
    const dapaCkd: EvalResultItem = { title: "Dapagliflozin in Patients with Chronic Kidney Disease", year: 2020 };
    expect(matchesMustHave(dapaCkd, { titleIncludes: ["dapagliflozin", "chronic kidney"] })).toBe(true);
    expect(matchesMustHave(partner3, { titleIncludes: ["dapagliflozin", "chronic kidney"] })).toBe(false);
  });
});

describe("rank + recall metrics", () => {
  const results = [caseReport, partner3, evolut6yr];
  const mustHaves = [{ pmids: ["30883058"] }, { pmids: ["41697183"] }];

  it("firstMatchRank is 1-based", () => {
    expect(firstMatchRank(results, { pmids: ["30883058"] })).toBe(2);
    expect(firstMatchRank(results, { pmids: ["does-not-exist"] })).toBeNull();
  });
  it("recallAtK", () => {
    expect(recallAtK(results, mustHaves, 10)).toBe(1);
    expect(recallAtK(results, mustHaves, 1)).toBe(0); // only the case report is in top-1
    expect(recallAtK(results, undefined, 10)).toBeNull();
  });
  it("bestMustHaveRank + MRR", () => {
    expect(bestMustHaveRank(results, mustHaves)).toBe(2);
    // MRR = mean(1/2 for partner3, 1/3 for evolut) = (0.5 + 0.3333)/2
    expect(meanReciprocalRank(results, mustHaves)).toBeCloseTo((0.5 + 1 / 3) / 2, 5);
  });
  it("ndcgAtK rewards relevant items ranked higher", () => {
    const good = ndcgAtK([partner3, evolut6yr, caseReport], mustHaves, 10)!;
    const bad = ndcgAtK([caseReport, partner3, evolut6yr], mustHaves, 10)!;
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeCloseTo(1, 5); // both relevant at top => ideal
  });
});

describe("ground-truth-free metrics", () => {
  it("fill rates", () => {
    expect(doiFillRate([partner3, caseReport])).toBe(0.5); // case report has no DOI
    expect(pmidFillRate([partner3, caseReport])).toBe(1);
  });
  it("duplicateRate detects repeats by DOI/PMID", () => {
    expect(duplicateRate([partner3, { ...partner3 }, evolut6yr])).toBeCloseTo(1 / 3, 5);
    expect(duplicateRate([partner3, evolut6yr])).toBe(0);
  });
  it("caseReportRate", () => {
    expect(caseReportRate([caseReport, partner3], 10)).toBe(0.5);
  });
  it("lexicalCoverage rewards on-topic titles", () => {
    const q = "transcatheter aortic valve low-risk outcomes";
    const onTopic = lexicalCoverage([partner3], q, 10);
    const offTopic = lexicalCoverage([{ title: "Diabetic ketoacidosis in pediatrics" }], q, 10);
    expect(onTopic).toBeGreaterThan(offTopic);
  });
});

describe("computeQueryMetrics + meanOf", () => {
  it("aggregates and bestInTop3 reflects rank", () => {
    const m = computeQueryMetrics([partner3, evolut6yr], {
      mustHaves: [{ pmids: ["30883058"] }],
      query: "TAVR low risk outcomes",
    });
    expect(m.bestMustHaveRank).toBe(1);
    expect(m.bestInTop3).toBe(true);
    expect(m.recallAt10).toBe(1);
  });
  it("meanOf ignores nulls", () => {
    const rows = [
      computeQueryMetrics([partner3], { mustHaves: [{ pmids: ["30883058"] }], query: "x" }),
      computeQueryMetrics([caseReport], { query: "y" }), // no must-haves => null recall
    ];
    expect(meanOf(rows, (r) => r.recallAt10)).toBe(1); // only the first row counts
    expect(meanOf(rows, (r) => r.doiFillRate)).toBeCloseTo(0.5, 5);
  });
});
