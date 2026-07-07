import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBreaker, mockResilientFetch } = vi.hoisted(() => ({
  mockBreaker: { canRequest: vi.fn(() => true), onSuccess: vi.fn(), onFailure: vi.fn() },
  mockResilientFetch: vi.fn(),
}));

vi.mock("@/lib/http/resilient-fetch", () => ({ resilientFetch: mockResilientFetch }));
vi.mock("@/lib/http/circuit-breaker", () => ({ createCircuitBreaker: vi.fn(() => mockBreaker) }));

import { searchStackExchange } from "../stackexchange";

function mockItems(items: unknown[]) {
  mockResilientFetch.mockResolvedValue({ json: () => Promise.resolve({ items }) } as Response);
}

describe("searchStackExchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreaker.canRequest.mockReturnValue(true);
  });

  it("maps SE questions, decoding HTML entities in titles", async () => {
    mockItems([
      { title: "Should we abandon &quot;significance&quot;?", link: "https://stats.stackexchange.com/questions/1/x", score: 5, answer_count: 2, creation_date: 1731395782 },
    ]);
    const res = await searchStackExchange("significance", { sites: [{ site: "stats", label: "Cross Validated" }] });
    expect(res.status.status).toBe("ok");
    expect(res.results[0]).toMatchObject({
      title: 'Should we abandon "significance"?',
      url: "https://stats.stackexchange.com/questions/1/x",
      domain: "stats.stackexchange.com",
      platform: "Stack Exchange",
      community: "Cross Validated",
      engagement: "5 votes · 2 answers",
      sources: ["discussions"],
      trustTier: "community",
    });
  });

  it("merges results across multiple sites, fail-open if one site fails", async () => {
    mockResilientFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ items: [{ title: "stats q", link: "https://stats.stackexchange.com/q/1" }] }) } as Response)
      .mockRejectedValueOnce(new Error("[StackExchange] HTTP 400"));
    const res = await searchStackExchange("q", {
      sites: [{ site: "stats", label: "Cross Validated" }, { site: "academia", label: "Academia" }],
    });
    // one site fulfilled -> ok, partial results returned (never throws)
    expect(res.status.status).toBe("ok");
    expect(res.results).toHaveLength(1);
  });

  it("is fail-open when ALL sites fail", async () => {
    mockResilientFetch.mockRejectedValue(new Error("[StackExchange] HTTP 500"));
    const res = await searchStackExchange("q", {
      sites: [{ site: "stats", label: "Cross Validated" }, { site: "academia", label: "Academia" }],
    });
    expect(res.results).toEqual([]);
    expect(res.status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalledTimes(1);
  });

  it("is fail-open when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const res = await searchStackExchange("q");
    expect(res.results).toEqual([]);
    expect(res.status.status).toBe("error");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });
});
