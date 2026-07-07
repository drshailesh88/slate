import { describe, expect, it } from "vitest";

import {
  COMMUNITY_DOMAINS,
  GOVERNMENT_DOMAINS,
  MAJOR_JOURNALISM_DOMAINS,
  getTrustTier,
} from "../trust-tier";

describe("getTrustTier", () => {
  it("ships the required curated domain counts", () => {
    expect(GOVERNMENT_DOMAINS.length).toBeGreaterThanOrEqual(200);
    expect(MAJOR_JOURNALISM_DOMAINS.length).toBeGreaterThanOrEqual(100);
    expect(COMMUNITY_DOMAINS.length).toBeGreaterThanOrEqual(50);
  });

  it("classifies government and institutional domains", () => {
    expect(getTrustTier("https://www.nih.gov/health-information")).toBe(
      "government"
    );
    expect(getTrustTier("https://cs.stanford.edu/research")).toBe(
      "government"
    );
    expect(getTrustTier("https://service.gov.uk/apply")).toBe("government");
    expect(getTrustTier("https://www.who.int/news-room")).toBe("government");
  });

  it("classifies major journalism domains including subdomains", () => {
    expect(getTrustTier("https://www.reuters.com/world/")).toBe(
      "major_journalism"
    );
    expect(getTrustTier("https://news.bbc.co.uk/2/hi/health/")).toBe(
      "major_journalism"
    );
    expect(getTrustTier("nytimes.com")).toBe("major_journalism");
  });

  it("classifies community domains", () => {
    expect(getTrustTier("https://www.reddit.com/r/science/")).toBe(
      "community"
    );
    expect(getTrustTier("https://news.ycombinator.com/item?id=1")).toBe(
      "community"
    );
    expect(getTrustTier("https://stackoverflow.com/questions/1")).toBe(
      "community"
    );
  });

  it("defaults unknown domains to other", () => {
    expect(getTrustTier("https://example.com")).toBe("other");
    expect(getTrustTier("not a url")).toBe("other");
  });
});
