import { describe, it, expect, vi } from "vitest";

vi.mock("@/data/scimago-medicine-2023.json", () => ({
  default: [
    { title: "the lancet", titleOriginal: "The Lancet", quartile: "Q1", citesPerDoc2y: 120, sjr: 13.1, hIndex: 750 },
    { title: "nature medicine", titleOriginal: "Nature Medicine", quartile: "Q1", citesPerDoc2y: 90, sjr: 10.5, hIndex: 500 },
    { title: "journal of clinical investigation", titleOriginal: "JCI", quartile: "Q1", citesPerDoc2y: 15, sjr: 5.2, hIndex: 350 },
    { title: "plos one", titleOriginal: "PLoS ONE", quartile: "Q2", citesPerDoc2y: 3.2, sjr: 0.8, hIndex: 332 },
    { title: "bmc medicine", titleOriginal: "BMC Medicine", quartile: "Q1", citesPerDoc2y: 8.5, sjr: 3.1, hIndex: 120 },
    { title: "the new england journal of medicine", titleOriginal: "The New England Journal of Medicine", quartile: "Q1", citesPerDoc2y: 110, sjr: 15.0, hIndex: 900 },
    { title: "journal of the american college of cardiology", titleOriginal: "Journal of the American College of Cardiology", quartile: "Q1", citesPerDoc2y: 24, sjr: 6.5, hIndex: 400 },
  ],
}));

import { lookupJournalQuality } from "../journal-quality";

describe("lookupJournalQuality", () => {
  it("finds exact match", () => {
    const result = lookupJournalQuality("the lancet");
    expect(result).not.toBeNull();
    expect(result!.quartile).toBe("Q1");
    expect(result!.quartileColor).toBe("emerald");
  });

  it("normalizes case", () => {
    const result = lookupJournalQuality("The Lancet");
    expect(result).not.toBeNull();
    expect(result!.quartile).toBe("Q1");
  });

  it("removes leading 'the'", () => {
    const result = lookupJournalQuality("The Nature Medicine");
    expect(result).not.toBeNull();
  });

  it("finds by includes match", () => {
    const result = lookupJournalQuality("bmc");
    expect(result).not.toBeNull();
    expect(result!.quartile).toBe("Q1");
  });

  it("returns null for unknown journal", () => {
    expect(lookupJournalQuality("Totally Unknown Journal")).toBeNull();
  });

  it("returns correct quartile colors", () => {
    const q2 = lookupJournalQuality("plos one");
    expect(q2).not.toBeNull();
    expect(q2!.quartileColor).toBe("sky");
  });

  it("returns numeric metrics", () => {
    const result = lookupJournalQuality("the lancet");
    expect(result!.citesPerDoc2y).toBe(120);
    expect(result!.sjr).toBe(13.1);
    expect(result!.hIndex).toBe(750);
  });

  it("handles whitespace in input", () => {
    const result = lookupJournalQuality("  the lancet  ");
    expect(result).not.toBeNull();
  });

  it("resolves an NLM/ISO journal abbreviation to its full-title quartile", () => {
    // PubMed (and other sources) return ISO abbreviations that are not substrings
    // of the full Scimago title — each abbrev token is a PREFIX of the full token.
    const nejm = lookupJournalQuality("N Engl J Med");
    expect(nejm).not.toBeNull();
    expect(nejm!.quartile).toBe("Q1");

    const jacc = lookupJournalQuality("J Am Coll Cardiol");
    expect(jacc).not.toBeNull();
    expect(jacc!.quartile).toBe("Q1");
  });

  it("returns null for an empty journal name (never a bogus quartile)", () => {
    expect(lookupJournalQuality("")).toBeNull();
    expect(lookupJournalQuality("   ")).toBeNull();
  });

  it("does not abbreviation-match an unrelated journal", () => {
    // tokens don't prefix any full title → no false positive
    expect(lookupJournalQuality("Xyz Qrs Tuv")).toBeNull();
  });
});
