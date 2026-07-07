import { describe, it, expect } from "vitest";
import { mapYouTubeResult } from "../youtube";

describe("mapYouTubeResult", () => {
  it("maps a search item to a UnifiedSearchResult with a watch URL and channel as label", () => {
    const m = mapYouTubeResult({
      id: { videoId: "47pkFey3CZ0" },
      snippet: {
        publishedAt: "2017-11-04T23:39:36Z",
        channelTitle: "Innovative Genomics Institute",
        title: "Jennifer Doudna: CRISPR Basics",
        description: "Jennifer Doudna explains the basics of CRISPR immunity.",
      },
    })!;
    expect(m.title).toBe("Jennifer Doudna: CRISPR Basics");
    expect(m.url).toBe("https://www.youtube.com/watch?v=47pkFey3CZ0");
    expect(m.domain).toBe("youtube.com");
    expect(m.sourceLabel).toBe("Innovative Genomics Institute");
    expect(m.abstract).toBe("Jennifer Doudna explains the basics of CRISPR immunity.");
    expect(m.year).toBe(2017);
    expect(m.publishedAt).toBe("2017-11-04T23:39:36Z");
    expect(m.sources).toEqual(["videos"]);
  });

  it("decodes HTML entities in the title and description", () => {
    const m = mapYouTubeResult({
      id: { videoId: "abc123" },
      snippet: {
        channelTitle: "MIT OpenCourseWare",
        title: "Diabetes &amp; the Heart: What&#39;s the link?",
        description: "Q&amp;A on &quot;statins&quot;",
      },
    })!;
    expect(m.title).toBe("Diabetes & the Heart: What's the link?");
    expect(m.abstract).toBe('Q&A on "statins"');
  });

  it("returns null when videoId or title is missing", () => {
    expect(mapYouTubeResult({ id: {}, snippet: { title: "no id" } })).toBeNull();
    expect(mapYouTubeResult({ id: { videoId: "x" }, snippet: { title: "" } })).toBeNull();
  });
});
