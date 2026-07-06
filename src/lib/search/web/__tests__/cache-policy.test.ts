import { describe, it, expect } from "vitest";
import { nonAcademicCacheTtl, shouldCacheFederatedList } from "../cache-policy";

describe("nonAcademicCacheTtl", () => {
  it("uses a short TTL for news — freshness is the product", () => {
    expect(nonAcademicCacheTtl("news")).toBeGreaterThan(0);
    expect(nonAcademicCacheTtl("news")).toBeLessThanOrEqual(30 * 60);
  });

  it("uses long TTLs for web and videos (relevance is stable; video also shields the YouTube quota)", () => {
    expect(nonAcademicCacheTtl("web")).toBeGreaterThanOrEqual(6 * 3600);
    expect(nonAcademicCacheTtl("videos")).toBeGreaterThanOrEqual(6 * 3600);
  });

  it("uses a medium TTL for discussions — between news and web", () => {
    expect(nonAcademicCacheTtl("discussions")).toBeGreaterThan(nonAcademicCacheTtl("news"));
    expect(nonAcademicCacheTtl("discussions")).toBeLessThan(nonAcademicCacheTtl("web"));
  });

  it("news is the shortest-lived tab of all", () => {
    const others = (["web", "videos", "discussions"] as const).map(nonAcademicCacheTtl);
    expect(Math.min(...others)).toBeGreaterThan(nonAcademicCacheTtl("news"));
  });
});

describe("shouldCacheFederatedList", () => {
  it("never caches a degraded (throttled/partial) response — it must not be served for the whole TTL", () => {
    expect(shouldCacheFederatedList({ results: [{}], degraded: true })).toBe(false);
  });

  it("never caches an empty response", () => {
    expect(shouldCacheFederatedList({ results: [], degraded: false })).toBe(false);
  });

  it("caches a healthy, non-empty response", () => {
    expect(shouldCacheFederatedList({ results: [{}, {}], degraded: false })).toBe(true);
  });
});
