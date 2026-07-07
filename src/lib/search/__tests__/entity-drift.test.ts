import { describe, it, expect } from "vitest";
import { entityDriftPenalty } from "../entity-drift";

/**
 * Off-entity drift demotion: a result whose TITLE is about a different clinical
 * SUBTYPE (HFpEF vs the queried HFrEF) or a different SPECIFIC DRUG (tirzepatide
 * vs the queried semaglutide) than the query specifies gets a gentle (<1)
 * multiplicative penalty. The penalty must NEVER fire for comparison queries,
 * class-level queries, or results that DO cover the queried entity.
 */
describe("entityDriftPenalty — contrastive subtype mismatch", () => {
  const HFREF_Q = "management of heart failure with reduced ejection fraction";

  it("demotes a preserved-EF (HFpEF) paper for a reduced-EF (HFrEF) query", () => {
    const p = entityDriftPenalty(HFREF_Q, {
      title: "Spironolactone for Heart Failure with Preserved Ejection Fraction",
    });
    expect(p).toBeLessThan(1);
    expect(p).toBeGreaterThan(0);
  });

  it("does NOT demote a reduced-EF paper for a reduced-EF query", () => {
    expect(
      entityDriftPenalty(HFREF_Q, {
        title: "Medical Management of Heart Failure With Reduced Ejection Fraction",
      })
    ).toBe(1);
  });

  it("does NOT demote a paper that covers BOTH subtypes (query member present)", () => {
    expect(
      entityDriftPenalty(HFREF_Q, {
        title:
          "Heart Failure with Preserved and Reduced Ejection Fraction in Hemodialysis Patients",
      })
    ).toBe(1);
  });

  it("does NOT fire when the query itself names both members (a comparison)", () => {
    const q =
      "In critically ill ICU patients, does conservative versus liberal oxygen therapy affect mortality?";
    expect(
      entityDriftPenalty(q, { title: "Conservative oxygen therapy in the ICU" })
    ).toBe(1);
  });

  it("demotes a secondary-prevention paper for a primary-prevention query", () => {
    const q = "systematic review and meta-analysis of statins for primary prevention";
    expect(
      entityDriftPenalty(q, {
        title: "Statins for secondary prevention of cardiovascular disease",
      })
    ).toBeLessThan(1);
  });
});

describe("entityDriftPenalty — off-specific-drug mismatch", () => {
  const SEMA_Q = "latest 2025 trials semaglutide cardiovascular outcomes";

  it("demotes a different-drug (tirzepatide) paper for a single-drug (semaglutide) query", () => {
    expect(
      entityDriftPenalty(SEMA_Q, {
        title: "Efficacy and safety of Tirzepatide in patients with heart failure",
      })
    ).toBeLessThan(1);
  });

  it("does NOT demote a paper that mentions the queried drug", () => {
    expect(
      entityDriftPenalty(SEMA_Q, {
        title: "Oral Semaglutide and cardiovascular risk factors in type 2 diabetes",
      })
    ).toBe(1);
  });

  it("does NOT fire for a comparison query naming two drugs of the class", () => {
    const q = "tirzepatide versus semaglutide for weight loss";
    expect(
      entityDriftPenalty(q, { title: "Tirzepatide for weight loss: a trial" })
    ).toBe(1);
  });

  it("does NOT fire for a class-level query (no single specific drug named)", () => {
    const q = "GLP-1 receptor agonists and risk of acute pancreatitis";
    expect(
      entityDriftPenalty(q, { title: "Semaglutide and risk of pancreatitis" })
    ).toBe(1);
  });

  it("does NOT demote a class-level review even on a single-drug query", () => {
    // A title about the class is legitimately relevant; only titles about a
    // DIFFERENT specific drug (and not the class) are demoted.
    expect(
      entityDriftPenalty(SEMA_Q, {
        title: "GLP-1 receptor agonists and cardiovascular outcomes: a meta-analysis",
      })
    ).toBe(1);
  });
});

describe("entityDriftPenalty — off-outcome (adverse-event) drift", () => {
  const PANC_Q = "GLP-1 receptor agonists and risk of acute pancreatitis";

  it("demotes an efficacy-outcome MA for an adverse-event query", () => {
    expect(
      entityDriftPenalty(PANC_Q, {
        title: "Cardiovascular, mortality, and kidney outcomes with GLP-1 receptor agonists",
      })
    ).toBeLessThan(1);
  });

  it("does NOT demote a result that covers the queried adverse outcome", () => {
    expect(
      entityDriftPenalty(PANC_Q, {
        title: "GLP-1 receptor agonists and risk of acute pancreatitis: a meta-analysis",
      })
    ).toBe(1);
  });

  it("does NOT fire for an efficacy/PICO query that genuinely wants those outcomes", () => {
    // The query is ABOUT cardiovascular mortality — efficacy results must NOT be demoted.
    const q = "In adults with type 2 diabetes, do SGLT2 inhibitors reduce cardiovascular mortality?";
    expect(
      entityDriftPenalty(q, { title: "SGLT2 inhibitors and cardiovascular mortality outcomes" })
    ).toBe(1);
  });

  it("fires for a ketoacidosis safety query", () => {
    expect(
      entityDriftPenalty("SGLT2 inhibitors and risk of diabetic ketoacidosis", {
        title: "Cardiovascular and renal outcomes with SGLT2 inhibitors: a meta-analysis",
      })
    ).toBeLessThan(1);
  });
});

describe("entityDriftPenalty — safety and bounds", () => {
  it("returns 1 for an unrelated query/result pair", () => {
    expect(
      entityDriftPenalty("KDIGO guideline chronic kidney disease", {
        title: "ESC guidelines management of atrial fibrillation",
      })
    ).toBe(1);
  });

  it("returns 1 for an empty or missing title", () => {
    expect(entityDriftPenalty("heart failure with reduced ejection fraction", {})).toBe(1);
  });

  it("always returns a multiplier in (0, 1]", () => {
    const p = entityDriftPenalty("statins for primary prevention", {
      title: "Statins for secondary prevention of preserved ejection fraction heart failure",
    });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
