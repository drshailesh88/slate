/**
 * Hacker News discussions source via the public HN Algolia search API
 * (https://hn.algolia.com/api — no key required). Returns real HN story
 * threads as UnifiedSearchResult[] tagged sources:["discussions"].
 *
 * Fail-open: on any error / circuit-open it returns an empty, non-ok status so
 * a down source can never zero the discussions tab.
 */
import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { classifyFetchError, okStatus, type SourceStatus } from "@/lib/search/source-status";
import { toKeywordQuery } from "@/lib/search/web/query-terms";

const breaker = createCircuitBreaker({ service: "HackerNews", failureThreshold: 5 });

const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const HN_ITEM_BASE = "https://news.ycombinator.com/item?id=";

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  author: string | null;
  created_at: string | null;
}

interface HnResponse {
  hits?: HnHit[];
  nbHits?: number;
}

function yearOf(date: string | null | undefined): number {
  if (!date) return 0;
  const m = date.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function formatEngagement(hit: HnHit): string | undefined {
  const parts: string[] = [];
  if (typeof hit.points === "number") parts.push(`${hit.points} points`);
  if (typeof hit.num_comments === "number") parts.push(`${hit.num_comments} comments`);
  return parts.length ? parts.join(" · ") : undefined;
}

function toUnified(hit: HnHit): UnifiedSearchResult | null {
  const title = (hit.title ?? "").trim();
  if (!title || !hit.objectID) return null;
  // The discussion thread itself lives on news.ycombinator.com; that is the
  // canonical result for the discussions tab (the linked article, if any, is
  // surfaced via the web tab instead).
  const threadUrl = `${HN_ITEM_BASE}${hit.objectID}`;
  const publishedAt = hit.created_at ?? undefined;
  return {
    title,
    authors: hit.author ? [hit.author] : [],
    journal: "Hacker News",
    url: threadUrl,
    domain: "news.ycombinator.com",
    year: yearOf(hit.created_at),
    publishedAt,
    sourceLabel: "Hacker News",
    platform: "Hacker News",
    community: hit.url ? (() => { try { return new URL(hit.url!).hostname.replace(/^www\./, ""); } catch { return undefined; } })() : undefined,
    engagement: formatEngagement(hit),
    abstract: undefined,
    citationCount: 0,
    publicationTypes: ["discussions"],
    isOpenAccess: false,
    sources: ["discussions"],
    trustTier: "community",
  };
}

export async function searchHackerNews(
  query: string,
  options: { limit?: number } = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    return { results: [], total: 0, status: { status: "error", message: "Circuit breaker open — recent Hacker News failures" } };
  }
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const url = new URL(HN_SEARCH_URL);
  url.searchParams.set("query", toKeywordQuery(query));
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(limit));
  // Verbose queries AND-match to zero on the title index; fall back to treating
  // all words as optional (relevance-ranked) so real threads still surface.
  url.searchParams.set("removeWordsIfNoResults", "allOptional");

  try {
    const res = await resilientFetch(url.toString(), undefined, {
      service: "HackerNews",
      timeout: 8000,
      baseDelay: 400,
      maxRetries: 1,
    });
    const data: HnResponse = await res.json();
    breaker.onSuccess();
    const results = (data.hits ?? [])
      .map(toUnified)
      .filter((r): r is UnifiedSearchResult => r !== null);
    return { results, total: data.nbHits ?? results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
