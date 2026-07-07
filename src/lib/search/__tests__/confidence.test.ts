import { describe, it, expect } from "vitest";
import { assessConfidence, LOW_CONFIDENCE_RELEVANCE } from "../confidence";

describe("assessConfidence", () => {
  it("reports 'ok' when at least one result is strongly relevant", () => {
    const results = [{ rerankScore: 0.85 }, { rerankScore: 0.4 }, { rerankScore: 0.1 }];
    expect(assessConfidence(results)).toBe("ok");
  });

  it("reports 'low' when even the best result is weakly relevant (trap / no strong match)", () => {
    // A negative-control or ambiguous query where nothing clears the relevance bar.
    const results = [{ rerankScore: 0.18 }, { rerankScore: 0.12 }, { rerankScore: 0.05 }];
    expect(assessConfidence(results)).toBe("low");
  });

  it("does NOT assert low confidence when there is no relevance signal at all", () => {
    // rerank is skipped for some lookups (e.g. trial-acronym); absence of a signal
    // is not evidence of a weak match — never cry wolf.
    const results = [{}, {}, {}];
    expect(assessConfidence(results)).toBe("ok");
  });

  it("treats the boundary as not-low (>= floor is ok)", () => {
    expect(assessConfidence([{ rerankScore: LOW_CONFIDENCE_RELEVANCE }])).toBe("ok");
  });

  it("returns 'ok' for an empty result set (no claim either way)", () => {
    expect(assessConfidence([])).toBe("ok");
  });

  it("respects a custom floor", () => {
    expect(assessConfidence([{ rerankScore: 0.45 }], 0.5)).toBe("low");
    expect(assessConfidence([{ rerankScore: 0.55 }], 0.5)).toBe("ok");
  });
});
