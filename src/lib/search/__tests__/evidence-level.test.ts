import { describe, it, expect } from "vitest";
import {
  getEvidenceLevel,
  mapPubMedPublicationType,
  mapS2PublicationType,
  mapOpenAlexType,
} from "../evidence-level";

describe("getEvidenceLevel", () => {
  it("should return Level I for meta-analysis", () => {
    const result = getEvidenceLevel("meta_analysis");
    expect(result.level).toBe("I");
    expect(result.label).toContain("Meta-Analysis");
  });

  it("should return Level I for systematic review", () => {
    expect(getEvidenceLevel("systematic_review").level).toBe("I");
  });

  it("should return Level II for RCT", () => {
    expect(getEvidenceLevel("rct").level).toBe("II");
  });

  it("should return Level III for cohort studies", () => {
    expect(getEvidenceLevel("cohort").level).toBe("III");
    expect(getEvidenceLevel("observational").level).toBe("III");
  });

  it("should return Level IV for case reports", () => {
    expect(getEvidenceLevel("case_control").level).toBe("IV");
    expect(getEvidenceLevel("case_report").level).toBe("IV");
  });

  it("should return Level V for unknown types", () => {
    expect(getEvidenceLevel("editorial").level).toBe("V");
    expect(getEvidenceLevel("").level).toBe("V");
    expect(getEvidenceLevel("unknown").level).toBe("V");
  });
});

describe("mapPubMedPublicationType", () => {
  it("should map Meta-Analysis", () => {
    expect(mapPubMedPublicationType("Meta-Analysis")).toBe("meta_analysis");
  });

  it("should map Systematic Review", () => {
    expect(mapPubMedPublicationType("Systematic Review")).toBe("systematic_review");
  });

  it("should map Randomized Controlled Trial", () => {
    expect(mapPubMedPublicationType("Randomized Controlled Trial")).toBe("rct");
  });

  it("should map Clinical Trial to rct", () => {
    expect(mapPubMedPublicationType("Clinical Trial")).toBe("rct");
  });

  it("should map case-insensitively", () => {
    expect(mapPubMedPublicationType("META-ANALYSIS")).toBe("meta_analysis");
  });

  it("should map unknown types to other", () => {
    expect(mapPubMedPublicationType("Commentary")).toBe("other");
  });
});

describe("mapS2PublicationType", () => {
  it("should map Review", () => {
    expect(mapS2PublicationType("Review")).toBe("review");
  });

  it("should map CaseReport", () => {
    expect(mapS2PublicationType("CaseReport")).toBe("case_report");
  });

  it("should map MetaAnalysis", () => {
    expect(mapS2PublicationType("MetaAnalysis")).toBe("meta_analysis");
  });

  it("should map unknown to other", () => {
    expect(mapS2PublicationType("Dataset")).toBe("other");
  });
});

describe("mapOpenAlexType", () => {
  it("should map review", () => {
    expect(mapOpenAlexType("review")).toBe("review");
  });

  it("should map article to other", () => {
    expect(mapOpenAlexType("article")).toBe("other");
  });

  it("should handle unknown types", () => {
    expect(mapOpenAlexType("conference-paper")).toBe("other");
  });
});
