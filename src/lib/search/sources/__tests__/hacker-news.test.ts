import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBreaker, mockResilientFetch } = vi.hoisted(() => ({
  mockBreaker: { canRequest: vi.fn(() => true), onSuccess: vi.fn(), onFailure: vi.fn() },
  mockResilientFetch: vi.fn(),
}));

vi.mock("@/lib/http/resilient-fetch", () => ({ resilientFetch: mockResilientFetch }));
vi.mock("@/lib/http/circuit-breaker", () => ({ createCircuitBreaker: vi.fn(() => mockBreaker) }));

import { searchHackerNews } from "../hacker-news";

function mockJson(data: unknown) {
  mockResilientFetch.mockResolvedValue({ json: () => Promise.resolve(data) } as Response);
}

describe("searchHackerNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreaker.canRequest.mockReturnValue(true);
  });

  it("maps HN stories to discussion threads on news.ycombinator.com", async () => {
    mockJson({
      nbHits: 2,
      hits: [
        { objectID: "111", title: "Peer review is broken", url: "https://blog.example.com/x", points: 583, num_comments: 337, author: "alice", created_at: "2023-08-06T12:33:24Z" },
        { objectID: "222", title: "Ask HN: preprints?", url: null, points: 12, num_comments: 4, author: "bob", created_at: "2024-01-02T00:00:00Z" },
      ],
    });

    const res = await searchHackerNews("peer review", { limit: 10 });

    expect(res.status.status).toBe("ok");
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({
      title: "Peer review is broken",
      url: "https://news.ycombinator.com/item?id=111",
      domain: "news.ycombinator.com",
      platform: "Hacker News",
      engagement: "583 points · 337 comments",
      sources: ["discussions"],
      trustTier: "community",
      year: 2023,
    });
    expect(res.results[1].url).toBe("https://news.ycombinator.com/item?id=222");
  });

  it("is fail-open on fetch error (empty + non-ok status, never throws)", async () => {
    mockResilientFetch.mockRejectedValue(new Error("[HackerNews] Request timed out after 8000ms"));
    const res = await searchHackerNews("anything");
    expect(res.results).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalledTimes(1);
  });

  it("is fail-open when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const res = await searchHackerNews("anything");
    expect(res.results).toEqual([]);
    expect(res.status.status).toBe("error");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("drops hits with no title or objectID", async () => {
    mockJson({ hits: [{ objectID: "", title: "no id", url: null }, { objectID: "9", title: "", url: null }] });
    const res = await searchHackerNews("x");
    expect(res.results).toEqual([]);
  });
});
