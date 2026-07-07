import { describe, it, expect } from "vitest";
import { sanitizeOpenAlexSearch } from "../sources/openalex";

describe("sanitizeOpenAlexSearch", () => {
  it("removes a trailing question mark from a natural-language query", () => {
    // OpenAlex treats ? as a wildcard operator and 400s on a stemmed search,
    // so a PICO question like '...reduce cardiovascular mortality?' must be cleaned.
    expect(
      sanitizeOpenAlexSearch(
        "do SGLT2 inhibitors reduce cardiovascular mortality?"
      )
    ).toBe("do SGLT2 inhibitors reduce cardiovascular mortality");
  });

  it("removes asterisk wildcard operators", () => {
    expect(sanitizeOpenAlexSearch("statin* therapy")).toBe("statin therapy");
  });

  it("removes multiple wildcards and collapses the resulting whitespace", () => {
    expect(sanitizeOpenAlexSearch("why* not? both?")).toBe("why not both");
  });

  it("leaves a query with no wildcard operators unchanged", () => {
    const q = "anticoagulation for stroke prevention in atrial fibrillation";
    expect(sanitizeOpenAlexSearch(q)).toBe(q);
  });

  it("handles a query that is only wildcards / whitespace", () => {
    expect(sanitizeOpenAlexSearch("  ? * ?  ")).toBe("");
  });
});
