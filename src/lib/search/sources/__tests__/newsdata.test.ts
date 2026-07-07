import { describe, it, expect } from "vitest";
import { mapNewsDataResult, parseNewsDataDate } from "../newsdata";

describe("parseNewsDataDate", () => {
  it("parses NewsData's 'YYYY-MM-DD HH:MM:SS' (UTC) stamp into ISO + year", () => {
    expect(parseNewsDataDate("2026-06-28 22:22:01")).toEqual({
      iso: "2026-06-28T22:22:01Z",
      year: 2026,
    });
  });

  it("returns year 0 and no iso for a missing or malformed stamp", () => {
    expect(parseNewsDataDate(undefined)).toEqual({ year: 0 });
    expect(parseNewsDataDate("yesterday")).toEqual({ year: 0 });
  });
});

describe("mapNewsDataResult", () => {
  it("maps an article to a UnifiedSearchResult with description as abstract and source_name as label", () => {
    const m = mapNewsDataResult({
      article_id: "abc",
      link: "https://www.nzherald.co.nz/lifestyle/poor-snacking/",
      title: "Your nutritious diet is being undone by poor snacking",
      description: "Tim Spector explains how snacking erodes a healthy diet.",
      content: "Full body text here.",
      pubDate: "2026-06-28 09:30:00",
      source_id: "nzherald",
      source_name: "NZ Herald",
      source_url: "https://www.nzherald.co.nz",
      source_priority: 7971,
      duplicate: false,
    })!;
    expect(m.title).toBe("Your nutritious diet is being undone by poor snacking");
    expect(m.url).toBe("https://www.nzherald.co.nz/lifestyle/poor-snacking/");
    expect(m.abstract).toBe("Tim Spector explains how snacking erodes a healthy diet.");
    expect(m.sourceLabel).toBe("NZ Herald");
    expect(m.domain).toBe("nzherald.co.nz");
    expect(m.year).toBe(2026);
    expect(m.publishedAt).toBe("2026-06-28T09:30:00Z");
    expect(m.sources).toEqual(["news"]);
  });

  it("falls back to content for the abstract and derives the domain from the link", () => {
    const m = mapNewsDataResult({
      link: "https://www.smh.com.au/peas",
      title: "Give peas a chance",
      description: null,
      content: "Peas are nutritionally dense.",
      pubDate: "2026-06-27 12:00:00",
      source_id: "smh",
    })!;
    expect(m.abstract).toBe("Peas are nutritionally dense.");
    expect(m.domain).toBe("smh.com.au");
  });

  it("returns null when title or link is missing", () => {
    expect(mapNewsDataResult({ link: "https://x.com", title: "" })).toBeNull();
    expect(mapNewsDataResult({ title: "no link" })).toBeNull();
  });
});
