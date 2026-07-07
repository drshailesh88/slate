import { describe, it, expect } from "vitest";
import { isRetractedByCrossref } from "../sources/crossref";

describe("isRetractedByCrossref", () => {
  it("detects retraction via update-to relation", () => {
    expect(
      isRetractedByCrossref({ DOI: "10.1/x", "update-to": [{ type: "retraction" }] })
    ).toBe(true);
  });
  it("detects retraction via update relation", () => {
    expect(
      isRetractedByCrossref({ DOI: "10.1/x", update: [{ type: "retraction" }] })
    ).toBe(true);
  });
  it("detects retraction via relation.is-retracted-by", () => {
    expect(
      isRetractedByCrossref({ DOI: "10.1/x", relation: { "is-retracted-by": [{}] } })
    ).toBe(true);
  });
  it("returns false for a normal work", () => {
    expect(
      isRetractedByCrossref({ DOI: "10.1/x", update: [{ type: "correction" }] })
    ).toBe(false);
    expect(isRetractedByCrossref({ DOI: "10.1/x" })).toBe(false);
  });
});
