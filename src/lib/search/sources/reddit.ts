/**
 * Reddit discussions source via the public listing JSON endpoint
 * (https://www.reddit.com/search.json — no key required). Returns real Reddit
 * threads as UnifiedSearchResult[] tagged sources:["discussions"].
 *
 * Fail-open: on any error / circuit-open it returns an empty, non-ok status so
 * a down source can never zero the discussions tab.
 *
 * NOTE: Reddit aggressively rate-limits / blocks (HTTP 403) requests from
 * datacenter IP ranges regardless of User-Agent. Where the serving egress IP is
 * blocked, set REDDIT_OAUTH_TOKEN (a bearer token from a registered script app)
 * to route through oauth.reddit.com instead; the source stays fail-open either
 * way.
 */
import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { classifyFetchError, okStatus, type SourceStatus } from "@/lib/search/source-status";
import { toKeywordQuery } from "@/lib/search/web/query-terms";

const breaker = createCircuitBreaker({ service: "Reddit", failureThreshold: 5 });

const USER_AGENT = "ScholarSync/1.0 (academic discussions search)";

interface RedditChild {
  data: {
    title: string;
    permalink: string;
    subreddit: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    selftext?: string;
    over_18?: boolean;
  };
}

interface RedditResponse {
  data?: { children?: RedditChild[] };
}

function endpoint(): { url: string; headers: Record<string, string> } {
  const token = process.env.REDDIT_OAUTH_TOKEN;
  if (token) {
    return {
      url: "https://oauth.reddit.com/search",
      headers: { "User-Agent": USER_AGENT, Authorization: `Bearer ${token}` },
    };
  }
  return { url: "https://www.reddit.com/search.json", headers: { "User-Agent": USER_AGENT } };
}

function toUnified(child: RedditChild): UnifiedSearchResult | null {
  const d = child.data;
  const title = (d.title ?? "").trim();
  if (!title || !d.permalink) return null;
  const created = d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined;
  const parts: string[] = [];
  if (typeof d.score === "number") parts.push(`${d.score} upvotes`);
  if (typeof d.num_comments === "number") parts.push(`${d.num_comments} comments`);
  const snippet = (d.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    title,
    authors: [],
    journal: `r/${d.subreddit}`,
    url: `https://www.reddit.com${d.permalink}`,
    domain: "reddit.com",
    year: created ? new Date(created).getUTCFullYear() : 0,
    publishedAt: created,
    sourceLabel: "Reddit",
    platform: "Reddit",
    community: `r/${d.subreddit}`,
    engagement: parts.length ? parts.join(" · ") : undefined,
    abstract: snippet || undefined,
    citationCount: 0,
    publicationTypes: ["discussions"],
    isOpenAccess: false,
    sources: ["discussions"],
    trustTier: "community",
  };
}

export async function searchReddit(
  query: string,
  options: { limit?: number } = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    return { results: [], total: 0, status: { status: "error", message: "Circuit breaker open — recent Reddit failures" } };
  }
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const { url: base, headers } = endpoint();
  const url = new URL(base);
  url.searchParams.set("q", toKeywordQuery(query));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("type", "link");
  url.searchParams.set("raw_json", "1");

  try {
    const res = await resilientFetch(url.toString(), { headers }, {
      service: "Reddit",
      timeout: 8000,
      baseDelay: 400,
      maxRetries: 0,
    });
    const data: RedditResponse = await res.json();
    breaker.onSuccess();
    const results = (data.data?.children ?? [])
      .filter((c) => !c.data.over_18)
      .map(toUnified)
      .filter((r): r is UnifiedSearchResult => r !== null);
    return { results, total: results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
