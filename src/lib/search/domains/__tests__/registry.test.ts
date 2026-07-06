import { describe, it, expect } from "vitest";
import {
  getDomainConfig,
  getRegisteredDomains,
  isDomainRegistered,
  rerankProfileForDomain,
} from "../registry";
import { medicineDomain } from "../medicine";
import { getDomainEvidenceLevel } from "../../evidence-level";

describe("getDomainConfig", () => {
  it('returns medicine config for "medicine"', () => {
    const config = getDomainConfig("medicine");
    expect(config.id).toBe("medicine");
  });

  it('returns multidisciplinary config for "multidisciplinary"', () => {
    const config = getDomainConfig("multidisciplinary");
    expect(config.id).toBe("multidisciplinary");
  });

  it("returns medicine config for undefined (default)", () => {
    const config = getDomainConfig(undefined);
    expect(config.id).toBe("medicine");
  });

  it("returns medicine config for null (default)", () => {
    const config = getDomainConfig(null);
    expect(config.id).toBe("medicine");
  });

  it("returns medicine config for unknown domain (fallback)", () => {
    const config = getDomainConfig("nonexistent");
    expect(config.id).toBe("medicine");
  });

  it("medicine config has all required fields", () => {
    const config = getDomainConfig("medicine");
    expect(config.sources).toBeDefined();
    expect(config.personas).toBeDefined();
    expect(config.personas.librarian).toBeTruthy();
    expect(config.personas.researcher).toBeTruthy();
    expect(config.personas.textbook).toBeTruthy();
    expect(config.evidenceHierarchy).toBeDefined();
    expect(config.filterOptions).toBeDefined();
    expect(config.synonymMap).toBeDefined();
    expect(config.features).toBeDefined();
  });

  it("medicine config routes through the good pipeline sources (PubMed + Europe PMC)", () => {
    const config = getDomainConfig("medicine");
    expect(config.sources).toContain("pubmed");
    expect(config.sources).toContain("europepmc");
    // The deprecated fan-out sources are no longer part of the academic pipeline.
    expect(config.sources).not.toContain("semantic_scholar");
    expect(config.sources).not.toContain("openalex");
    expect(config.sources).not.toContain("clinical_trials");
  });

  it("medicine evidence hierarchy has exactly 5 levels", () => {
    const config = getDomainConfig("medicine");
    expect(config.evidenceHierarchy).toHaveLength(5);
    const levels = config.evidenceHierarchy.map((e) => e.level);
    expect(levels).toEqual(["I", "II", "III", "IV", "V"]);
  });

  it("medicine evidence hierarchy level I includes meta_analysis and systematic_review", () => {
    const config = getDomainConfig("medicine");
    const levelI = config.evidenceHierarchy.find((e) => e.level === "I");
    expect(levelI).toBeDefined();
    expect(levelI!.studyTypes).toContain("meta_analysis");
    expect(levelI!.studyTypes).toContain("systematic_review");
  });
});

describe("getDomainEvidenceLevel", () => {
  it("returns level I with emerald for meta_analysis in medicine", () => {
    const result = getDomainEvidenceLevel("meta_analysis", medicineDomain);
    expect(result.level).toBe("I");
    expect(result.color).toBe("emerald");
  });

  it("returns level II with sky for rct in medicine", () => {
    const result = getDomainEvidenceLevel("rct", medicineDomain);
    expect(result.level).toBe("II");
    expect(result.color).toBe("sky");
  });

  it("returns the lowest level for unknown study types (fallback)", () => {
    const result = getDomainEvidenceLevel("unknown_type", medicineDomain);
    expect(result.level).toBe("V");
    expect(result.color).toBe("slate");
  });

  it("uses the existing hardcoded function when domain is undefined (backward compat)", () => {
    const result = getDomainEvidenceLevel("meta_analysis", undefined);
    expect(result.level).toBe("I");
    expect(result.label).toContain("Meta-Analysis");
  });
});

describe("getRegisteredDomains", () => {
  it("returns medicine and multidisciplinary", () => {
    const domains = getRegisteredDomains();
    expect(domains).toContain("medicine");
    expect(domains).toContain("multidisciplinary");
  });
});

describe("isDomainRegistered", () => {
  it("returns true for medicine", () => {
    expect(isDomainRegistered("medicine")).toBe(true);
  });

  it("returns false for unknown domain", () => {
    expect(isDomainRegistered("nonexistent")).toBe(false);
  });
});

describe("rerankProfileForDomain — routes the cross-encoder by discipline", () => {
  it("routes biomedical disciplines (medicine, biology) to MedCPT", () => {
    expect(rerankProfileForDomain("medicine")).toBe("biomedical");
    expect(rerankProfileForDomain("biology")).toBe("biomedical");
  });

  it("routes non-biomedical disciplines to the general bge model", () => {
    for (const d of ["computer_science", "economics", "psychology", "statistics", "physics"]) {
      expect(rerankProfileForDomain(d)).toBe("general");
    }
  });

  it("defaults to biomedical only when the domain is absent (medicine is the app default)", () => {
    expect(rerankProfileForDomain()).toBe("biomedical");
    expect(rerankProfileForDomain(null)).toBe("biomedical");
  });

  it("normalizes hyphen/underscore and case, and routes unknown disciplines to general", () => {
    expect(rerankProfileForDomain("Computer-Science")).toBe("general");
    expect(rerankProfileForDomain("nonexistent")).toBe("general");
  });
});
