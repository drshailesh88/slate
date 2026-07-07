import { describe, it, expect } from "vitest";
import { mapBraveResult, braveFreshness, buildBraveQuery } from "../brave";

describe("mapBraveResult", () => {
  it("maps a web result to a UnifiedSearchResult, stripping HTML and folding extra_snippets", () => {
    const m = mapBraveResult(
      {
        title: "Gut Microbiome <strong>Depression</strong>",
        url: "https://example.com/a",
        description: "A <strong>bidirectional</strong> link",
        profile: { name: "Example Profile" },
        meta_url: { hostname: "www.example.com" },
        extra_snippets: ["snippet one", "snippet two"],
      },
      "web"
    )!;
    expect(m.title).toBe("Gut Microbiome Depression");
    expect(m.url).toBe("https://example.com/a");
    expect(m.abstract).toContain("bidirectional");
    expect(m.abstract).toContain("snippet one");
    expect(m.sourceLabel).toBe("Example Profile");
    expect(m.domain).toBe("example.com");
    expect(m.sources).toEqual(["web"]);
  });

  it("maps a news result with page_age into year + publishedAt", () => {
    const m = mapBraveResult(
      {
        title: "Ozempic shortage",
        url: "https://news.example.com/x",
        description: "supply",
        page_age: "2026-06-27T12:41:03",
        meta_url: { hostname: "news.example.com" },
      },
      "news"
    )!;
    expect(m.year).toBe(2026);
    expect(m.publishedAt).toBe("2026-06-27T12:41:03");
    expect(m.sources).toEqual(["news"]);
  });

  it("tags discussions results and derives domain from the url when meta_url is absent", () => {
    const m = mapBraveResult(
      { title: "PhD burnout thread", url: "https://www.reddit.com/r/AskAcademia/abc" },
      "discussions"
    )!;
    expect(m.sources).toEqual(["discussions"]);
    expect(m.domain).toBe("reddit.com");
  });

  it("returns null when title or url is missing", () => {
    expect(mapBraveResult({ url: "https://x.com" }, "web")).toBeNull();
    expect(mapBraveResult({ title: "no url" }, "web")).toBeNull();
  });
});

describe("braveFreshness", () => {
  it("maps a timeRange to Brave freshness codes", () => {
    expect(braveFreshness("24h")).toBe("pd");
    expect(braveFreshness("week")).toBe("pw");
    expect(braveFreshness("month")).toBe("pm");
    expect(braveFreshness("year")).toBe("py");
    expect(braveFreshness(undefined)).toBeUndefined();
  });
});

describe("buildBraveQuery", () => {
  it("prepends a site: filter when provided", () => {
    expect(buildBraveQuery("phd burnout", "reddit.com")).toBe("site:reddit.com phd burnout");
  });
  it("returns the query unchanged with no filter", () => {
    expect(buildBraveQuery("phd burnout")).toBe("phd burnout");
  });
});
