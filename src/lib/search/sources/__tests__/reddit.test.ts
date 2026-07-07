import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBreaker, mockResilientFetch } = vi.hoisted(() => ({
  mockBreaker: { canRequest: vi.fn(() => true), onSuccess: vi.fn(), onFailure: vi.fn() },
  mockResilientFetch: vi.fn(),
}));

vi.mock("@/lib/http/resilient-fetch", () => ({ resilientFetch: mockResilientFetch }));
vi.mock("@/lib/http/circuit-breaker", () => ({ createCircuitBreaker: vi.fn(() => mockBreaker) }));

import { searchReddit } from "../reddit";

function mockChildren(children: unknown[]) {
  mockResilientFetch.mockResolvedValue({
    json: () => Promise.resolve({ data: { children } }),
  } as Response);
}

describe("searchReddit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreaker.canRequest.mockReturnValue(true);
    delete process.env.REDDIT_OAUTH_TOKEN;
  });

  it("maps Reddit threads to reddit.com results", async () => {
    mockChildren([
      { data: { title: "PhD burnout", permalink: "/r/PhD/comments/abc/phd_burnout/", subreddit: "PhD", score: 240, num_comments: 88, created_utc: 1704153600, selftext: "  long  text " } },
    ]);
    const res = await searchReddit("phd burnout", { limit: 10 });
    expect(res.status.status).toBe("ok");
    expect(res.results[0]).toMatchObject({
      title: "PhD burnout",
      url: "https://www.reddit.com/r/PhD/comments/abc/phd_burnout/",
      domain: "reddit.com",
      community: "r/PhD",
      engagement: "240 upvotes · 88 comments",
      sources: ["discussions"],
      trustTier: "community",
    });
  });

  it("filters out NSFW threads", async () => {
    mockChildren([{ data: { title: "x", permalink: "/r/x/1/", subreddit: "x", over_18: true } }]);
    const res = await searchReddit("x");
    expect(res.results).toEqual([]);
  });

  it("is fail-open on a 403 block (empty + non-ok, never throws)", async () => {
    mockResilientFetch.mockRejectedValue(new Error("[Reddit] HTTP 403"));
    const res = await searchReddit("anything");
    expect(res.results).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalledTimes(1);
  });

  it("uses the OAuth endpoint + bearer header when REDDIT_OAUTH_TOKEN is set", async () => {
    process.env.REDDIT_OAUTH_TOKEN = "tok";
    mockChildren([]);
    await searchReddit("q");
    const [url, init] = mockResilientFetch.mock.calls[0];
    expect(url).toContain("oauth.reddit.com/search");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("is fail-open when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const res = await searchReddit("q");
    expect(res.results).toEqual([]);
    expect(res.status.status).toBe("error");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });
});
