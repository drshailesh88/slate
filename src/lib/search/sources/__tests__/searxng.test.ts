import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBreaker, mockResilientFetch } = vi.hoisted(() => {
  const mockBreaker = {
    canRequest: vi.fn(() => true),
    onSuccess: vi.fn(),
    onFailure: vi.fn(),
  };

  return {
    mockBreaker,
    mockResilientFetch: vi.fn(),
  };
});

vi.mock("@/lib/http/resilient-fetch", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("@/lib/http/circuit-breaker", () => ({
  createCircuitBreaker: vi.fn(() => mockBreaker),
}));

import { searchSearXNG } from "../searxng";

function mockJsonResponse(data: unknown) {
  mockResilientFetch.mockResolvedValue({
    json: () => Promise.resolve(data),
  } as Response);
}

describe("searchSearXNG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreaker.canRequest.mockReturnValue(true);
    process.env.SEARXNG_URL = "http://searxng.test";
  });

  it("returns normalized results", async () => {
    mockJsonResponse({
      number_of_results: 2,
      results: [
        {
          url: "https://www.noaa.gov/climate",
          title: "Climate Change",
          content: " NOAA explains the latest climate science. ",
          metadata: "NOAA",
          category: "general",
          publishedDate: "2025-07-01T12:00:00",
        },
        {
          url: "https://www.foxbusiness.com/category/climate-change",
          title: "Climate change",
          content: "Stay updated with the latest climate change news.",
          metadata: "3 hours ago | Fox Business",
          category: "news",
          publishedDate: "2026-03-31T08:47:00",
        },
      ],
    });

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response.degraded).toBe(false);
    expect(response.total).toBe(2);
    expect(response.results).toHaveLength(2);

    expect(response.results[0]).toMatchObject({
      title: "Climate Change",
      authors: [],
      journal: "NOAA",
      url: "https://www.noaa.gov/climate",
      domain: "noaa.gov",
      year: 2025,
      abstract: "NOAA explains the latest climate science.",
      publicationTypes: ["web"],
      isOpenAccess: false,
      citationCount: 0,
      sources: ["web"],
    });

    expect(response.results[1]).toMatchObject({
      title: "Climate change",
      journal: "Fox Business",
      domain: "foxbusiness.com",
      year: 2026,
      publishedAt: "2026-03-31T08:47:00",
      sourceLabel: "Fox Business",
      sources: ["web"],
    });
  });

  it("handles timeout gracefully", async () => {
    mockResilientFetch.mockRejectedValue(
      new Error("[SearXNG] Request timed out after 4500ms")
    );

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response).toEqual({
      results: [],
      total: 0,
      degraded: true,
    });
    expect(mockBreaker.onFailure).toHaveBeenCalledTimes(1);
  });

  it("handles empty results", async () => {
    mockJsonResponse({
      number_of_results: 0,
      results: [],
    });

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response).toEqual({
      results: [],
      total: 0,
      degraded: false,
    });
    expect(mockBreaker.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("handles SearXNG being down", async () => {
    mockResilientFetch.mockRejectedValue(new TypeError("fetch failed"));

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response.degraded).toBe(true);
    expect(response.results).toEqual([]);
    expect(response.total).toBe(0);
  });

  it("returns degraded when SEARXNG_URL is missing", async () => {
    delete process.env.SEARXNG_URL;

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response).toEqual({
      results: [],
      total: 0,
      degraded: true,
    });
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("returns degraded when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);

    const response = await searchSearXNG("climate change", {
      category: "general",
    });

    expect(response).toEqual({
      results: [],
      total: 0,
      degraded: true,
    });
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("maps categories correctly", async () => {
    mockJsonResponse({
      number_of_results: 1,
      results: [
        {
          url: "https://example.com/post",
          title: "Post",
          content: "<p>Example discussion content</p>",
          category: "social media",
          publishedDate: "2024-01-02T00:00:00",
        },
      ],
    });

    const web = await searchSearXNG("climate change", { category: "general" });
    const news = await searchSearXNG("climate change", { category: "news" });
    const discussions = await searchSearXNG("climate change", {
      category: "social media",
    });

    expect(web.results[0]?.sources).toEqual(["web"]);
    expect(news.results[0]?.sources).toEqual(["news"]);
    expect(discussions.results[0]?.sources).toEqual(["discussions"]);
    expect(discussions.results[0]).toMatchObject({
      publishedAt: "2024-01-02T00:00:00",
    });

    expect(mockResilientFetch.mock.calls[0]?.[0]).toContain("categories=general");
    expect(mockResilientFetch.mock.calls[1]?.[0]).toContain("categories=news");
    expect(mockResilientFetch.mock.calls[2]?.[0]).toContain(
      "categories=social+media"
    );
  });

  it("preserves the upstream total after limiting the returned result set", async () => {
    mockJsonResponse({
      number_of_results: 57,
      results: Array.from({ length: 50 }, (_, index) => ({
        url: `https://example.com/${index}`,
        title: `Result ${index}`,
        content: `Snippet ${index}`,
        category: "general",
      })),
    });

    const response = await searchSearXNG("climate change", {
      category: "general",
      limit: 40,
    });

    expect(response.results).toHaveLength(40);
    expect(response.total).toBe(57);
  });

  it("extracts discussion metadata for result cards", async () => {
    mockJsonResponse({
      number_of_results: 1,
      results: [
        {
          url: "https://www.reddit.com/r/science/comments/abc123/example/",
          title: "Example thread",
          content: "Discussion snippet",
          metadata: "2 hours ago | Reddit | r/science | ▲ 847 | 234 comments",
          category: "social media",
          publishedDate: "2026-03-31T10:00:00",
        },
      ],
    });

    const response = await searchSearXNG("example", {
      category: "social media",
    });

    expect(response.results[0]).toMatchObject({
      sourceLabel: "Reddit",
      platform: "Reddit",
      community: "r/science",
      engagement: "▲ 847 · 234 comments",
    });
  });
});
