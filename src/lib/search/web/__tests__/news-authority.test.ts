import { describe, it, expect } from "vitest";
import { applyNewsAuthorityFloor } from "../news-authority";
import type { UnifiedSearchResult } from "@/types/search";
import type { TrustTier } from "@/lib/search/trust-tier";

function r(tier: TrustTier, id: string): UnifiedSearchResult {
  return {
    title: id,
    authors: [],
    journal: "",
    year: 2026,
    url: `https://${id}.example`,
    domain: `${id}.example`,
    trustTier: tier,
    sources: ["news"],
    citationCount: 0,
    publicationTypes: ["news"],
    isOpenAccess: false,
  };
}

describe("applyNewsAuthorityFloor", () => {
  it("drops non-credible (other/community) sources when enough credible remain", () => {
    const out = applyNewsAuthorityFloor(
      [r("government", "a"), r("other", "b"), r("major_journalism", "c"), r("community", "d")],
      2
    );
    expect(out.map((x) => x.title)).toEqual(["a", "c"]); // b (other) + d (community) dropped
  });

  it("preserves the ranking order of the surviving credible sources", () => {
    const out = applyNewsAuthorityFloor(
      [r("major_journalism", "a"), r("government", "b"), r("major_journalism", "c")],
      2
    );
    expect(out.map((x) => x.title)).toEqual(["a", "b", "c"]);
  });

  it("backfills with the best non-credible when credible are too few — never empties the tab", () => {
    const out = applyNewsAuthorityFloor(
      [r("other", "a"), r("government", "b"), r("other", "c"), r("other", "d")],
      3
    );
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("b"); // the one credible source leads
    expect(out.slice(1).every((x) => x.trustTier === "other")).toBe(true); // then backfill
  });

  it("falls back to computing the tier from the domain when trustTier is absent", () => {
    const bare = { ...r("other", "x"), trustTier: undefined, domain: "cdc.gov", url: "https://cdc.gov/flu" };
    const out = applyNewsAuthorityFloor([bare, r("other", "y")], 1);
    expect(out.map((x) => x.domain)).toEqual(["cdc.gov"]); // cdc.gov resolves to government → kept, y dropped
  });
});
