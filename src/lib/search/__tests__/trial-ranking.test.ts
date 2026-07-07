import { describe, it, expect } from "vitest";
import {
  isSecondaryTrialResult,
  demoteSecondaryTrialResults,
} from "../trial-ranking";

/**
 * For a trial-acronym lookup ("DAPA-HF trial") the canonical answer is the
 * PRIMARY trial report, not its meta-analyses, sub-studies, or follow-ups.
 * `demoteSecondaryTrialResults` stably moves secondary literature below the
 * primary report so it rises into the top-3 — and can NEVER lower the primary.
 */
describe("isSecondaryTrialResult", () => {
  it("flags meta-analyses and systematic reviews as secondary", () => {
    expect(isSecondaryTrialResult({ title: "x", studyType: "meta_analysis" })).toBe(true);
    expect(isSecondaryTrialResult({ title: "x", studyType: "systematic_review" })).toBe(true);
  });

  it("flags sub-study / follow-up title markers as secondary", () => {
    expect(
      isSecondaryTrialResult({
        title: "Effects of dapagliflozin in DAPA-HF according to background heart failure therapy",
        studyType: "rct",
      })
    ).toBe(true);
    expect(
      isSecondaryTrialResult({
        title: "Iron Deficiency in Heart Failure and Effect of Dapagliflozin: Findings From DAPA-HF",
        studyType: "rct",
      })
    ).toBe(true);
    expect(
      isSecondaryTrialResult({
        title: "Intensive Versus Standard Blood Pressure Control in SPRINT-Eligible Participants",
        studyType: "rct",
      })
    ).toBe(true);
  });

  it("flags trial follow-up / cost / QoL sub-reports as secondary", () => {
    for (const title of [
      "Economic Outcomes of Transcatheter Versus Surgical Aortic Valve Replacement",
      "Five-Year Outcomes in Low-Risk Patients Undergoing Surgery in the PARTNER 3 Trial",
      "Transcatheter or Surgical Aortic-Valve Replacement in Low-Risk Patients at 7 Years",
      "Quality of Life After Transcatheter Aortic-Valve Replacement",
      "The PARTNER 3 Bicuspid Registry for Transcatheter Aortic Valve Replacement",
    ]) {
      expect(isSecondaryTrialResult({ title, studyType: "rct" })).toBe(true);
    }
  });

  it("does NOT flag the primary trial report", () => {
    expect(
      isSecondaryTrialResult({
        title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
        studyType: "rct",
      })
    ).toBe(false);
    expect(
      isSecondaryTrialResult({
        title: "A Randomized Trial of Intensive versus Standard Blood-Pressure Control",
        studyType: "rct",
      })
    ).toBe(false);
    expect(
      isSecondaryTrialResult({
        title: "Transcatheter Aortic-Valve Replacement with a Balloon-Expandable Valve in Low-Risk Patients",
        studyType: "rct",
      })
    ).toBe(false);
  });
});

describe("demoteSecondaryTrialResults", () => {
  const r = (title: string, studyType: string) => ({ title, studyType });

  it("raises a buried primary report above its meta-analyses and sub-studies", () => {
    const input = [
      r("SGLT2 inhibitors in HFrEF: a meta-analysis", "meta_analysis"),
      r("Effects of dapagliflozin in DAPA-HF according to background therapy", "rct"),
      r("Iron Deficiency and Effect of Dapagliflozin: Findings From DAPA-HF", "rct"),
      r("Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction", "rct"), // primary
    ];
    const out = demoteSecondaryTrialResults(input);
    const primaryIdx = out.findIndex((x) =>
      x.title.startsWith("Dapagliflozin in Patients with Heart Failure")
    );
    expect(primaryIdx).toBe(0); // primary floats to the top
  });

  it("is stable within the primary and secondary groups", () => {
    const input = [
      r("Meta A", "meta_analysis"),
      r("Primary One", "rct"),
      r("Sub according to X", "rct"),
      r("Primary Two", "rct"),
    ];
    const out = demoteSecondaryTrialResults(input).map((x) => x.title);
    expect(out).toEqual(["Primary One", "Primary Two", "Meta A", "Sub according to X"]);
  });

  it("returns the input unchanged when there is no secondary literature", () => {
    const input = [r("Primary One", "rct"), r("Primary Two", "rct")];
    const out = demoteSecondaryTrialResults(input);
    expect(out).toBe(input);
  });

  it("never lowers the primary report's position", () => {
    const input = [
      r("Primary", "rct"),
      r("Meta", "meta_analysis"),
    ];
    const out = demoteSecondaryTrialResults(input);
    expect(out[0].title).toBe("Primary");
  });
});
