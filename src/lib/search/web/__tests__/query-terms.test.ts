import { describe, expect, it } from "vitest";
import { toKeywordQuery } from "../query-terms";

describe("toKeywordQuery", () => {
  it("strips discussion-format and function words", () => {
    expect(toKeywordQuery("peer review reform discussion")).toBe("peer review reform");
    expect(toKeywordQuery("preprints versus journal publication debate")).toBe("preprints journal publication");
    expect(toKeywordQuery("abandon statistical significance discussion")).toBe("abandon statistical significance");
  });

  it("preserves content-only queries", () => {
    expect(toKeywordQuery("PhD burnout coping strategies")).toBe("PhD burnout coping strategies");
    expect(toKeywordQuery("ASPIRIN trial")).toBe("ASPIRIN trial");
  });

  it("falls back to the original when filtering empties the query", () => {
    expect(toKeywordQuery("the news discussion")).toBe("the news discussion");
  });
});
