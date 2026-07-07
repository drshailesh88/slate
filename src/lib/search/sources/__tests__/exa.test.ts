import { describe, it, expect } from "vitest";
import { mapExaResult, parseExaDate, exaCategoryForTab } from "../exa";

describe("parseExaDate", () => {
  it("parses a full ISO publishedDate into ISO + year", () => {
    expect(parseExaDate("2026-06-28T22:22:01.000Z")).toEqual({
      iso: "2026-06-28T22:22:01.000Z",
      year: 2026,
    });
  });

  it("parses a bare YYYY-MM-DD publishedDate into ISO + year", () => {
    expect(parseExaDate("2023-10-26")).toEqual({
      iso: "2023-10-26",
      year: 2023,
    });
  });

  it("returns year 0 and no iso for a missing or malformed date", () => {
    expect(parseExaDate(undefined)).toEqual({ year: 0 });
    expect(parseExaDate(null)).toEqual({ year: 0 });
    expect(parseExaDate("sometime")).toEqual({ year: 0 });
  });
});

describe("exaCategoryForTab", () => {
  it("maps news to the news category and web to no category", () => {
    expect(exaCategoryForTab("news")).toBe("news");
    expect(exaCategoryForTab("web")).toBeUndefined();
  });
});

describe("mapExaResult", () => {
  it("maps a result to a UnifiedSearchResult using text as the abstract and domain as the label", () => {
    const m = mapExaResult(
      {
        title: "A breakthrough in solid-state batteries",
        url: "https://www.nature.com/articles/solid-state-batteries",
        publishedDate: "2026-05-01T00:00:00.000Z",
        text: "Researchers report a new electrolyte that doubles cycle life.",
        highlights: ["doubles cycle life"],
      },
      "web"
    )!;
    expect(m.title).toBe("A breakthrough in solid-state batteries");
    expect(m.url).toBe("https://www.nature.com/articles/solid-state-batteries");
    expect(m.abstract).toBe("Researchers report a new electrolyte that doubles cycle life.");
    expect(m.domain).toBe("nature.com");
    expect(m.sourceLabel).toBe("nature.com");
    expect(m.year).toBe(2026);
    expect(m.publishedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(m.sources).toEqual(["web"]);
  });

  it("falls back to joined highlights when text is absent", () => {
    const m = mapExaResult(
      {
        title: "Fed holds rates",
        url: "https://www.reuters.com/markets/fed-holds",
        highlights: ["The Federal Reserve held rates steady", "citing cooling inflation"],
      },
      "news"
    )!;
    expect(m.abstract).toBe("The Federal Reserve held rates steady citing cooling inflation");
    expect(m.domain).toBe("reuters.com");
    expect(m.sources).toEqual(["news"]);
  });

  it("returns null when title or url is missing", () => {
    expect(mapExaResult({ title: "", url: "https://x.com" }, "web")).toBeNull();
    expect(mapExaResult({ title: "no url", url: "" }, "web")).toBeNull();
  });
});
