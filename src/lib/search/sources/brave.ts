import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { normalizeDomain } from "@/lib/search/domain-utils";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";
import type { UnifiedSearchResult } from "@/types/search";

const breaker = createCircuitBreaker({ service: "Brave", failureThreshold: 5 });

// Brave's free tier is ~1 query/second. Pace to avoid self-inflicted 429s that
// would trip the breaker and dark the lane.
const limiter = createOutboundLimiter({
  service: "Brave",
  requestsPerSecond: 1,
  burst: 1,
});

const ENDPOINT: Record<"web" | "news", string> = {
  web: "https://api.search.brave.com/res/v1/web/search",
  news: "https://api.search.brave.com/res/v1/news/search",
};

/** The non-academic tab a result is tagged with — web/news use their endpoint, discussions rides the web endpoint with a site: filter. */
type BraveTag = "web" | "news" | "discussions";

export interface BraveSearchOptions {
  /** Which Brave endpoint to query. */
  kind: "web" | "news";
  limit?: number;
  timeRange?: "24h" | "week" | "month" | "year";
  /** Restrict to a single domain via a `site:` operator (e.g. "reddit.com"). */
  siteFilter?: string;
  /** Source tag for the mapped results; defaults to `kind`. Discussions sets this to "discussions". */
  tag?: BraveTag;
}

interface BraveRawResult {
  title?: string;
  url?: string;
  description?: string;
  profile?: { name?: string } | null;
  meta_url?: { hostname?: string } | null;
  page_age?: string | null;
  extra_snippets?: string[] | null;
}

interface BraveWebResponse {
  web?: { results?: BraveRawResult[] };
  results?: BraveRawResult[];
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function clean(text: string | null | undefined): string {
  return collapseWhitespace(stripHtml(text ?? ""));
}

function domainOf(url: string, metaHost?: string | null): string {
  const host = metaHost ?? "";
  if (host) return host.replace(/^www\./, "");
  try {
    return normalizeDomain(url) ?? new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Map a Brave freshness window from the unified timeRange vocabulary. */
export function braveFreshness(
  timeRange?: "24h" | "week" | "month" | "year"
): string | undefined {
  switch (timeRange) {
    case "24h":
      return "pd";
    case "week":
      return "pw";
    case "month":
      return "pm";
    case "year":
      return "py";
    default:
      return undefined;
  }
}

/** Prepend a `site:` operator to scope the query to one domain. */
export function buildBraveQuery(query: string, siteFilter?: string): string {
  return siteFilter ? `site:${siteFilter} ${query}` : query;
}

export function mapBraveResult(
  raw: BraveRawResult,
  tag: BraveTag
): UnifiedSearchResult | null {
  const title = clean(raw.title);
  const url = raw.url ?? "";
  if (!title || !url) return null;

  const extras = (raw.extra_snippets ?? []).map(clean).filter(Boolean);
  const abstract = [clean(raw.description), ...extras].filter(Boolean).join(" ");
  const domain = domainOf(url, raw.meta_url?.hostname);
  const sourceLabel = raw.profile?.name || domain;
  const publishedAt = raw.page_age || undefined;
  const year = publishedAt
    ? parseInt(publishedAt.match(/(\d{4})/)?.[1] ?? "0", 10)
    : 0;

  return {
    title,
    authors: [],
    journal: sourceLabel,
    url,
    domain,
    year,
    publishedAt,
    sourceLabel,
    abstract: abstract || undefined,
    citationCount: 0,
    publicationTypes: [tag],
    isOpenAccess: false,
    sources: [tag],
  };
}

export async function searchBrave(
  query: string,
  options: BraveSearchOptions
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) {
    return {
      results: [],
      total: 0,
      status: { status: "missing_config", message: "BRAVE_API_KEY not set" },
    };
  }
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Brave failures" },
    };
  }

  const url = new URL(ENDPOINT[options.kind]);
  url.searchParams.set("q", buildBraveQuery(query, options.siteFilter));
  if (options.limit) {
    url.searchParams.set("count", String(Math.min(options.limit, 20)));
  }
  const freshness = braveFreshness(options.timeRange);
  if (freshness) url.searchParams.set("freshness", freshness);

  const tag: BraveTag = options.tag ?? options.kind;

  try {
    await limiter.acquire();
    const res = await resilientFetch(
      url.toString(),
      { headers: { "X-Subscription-Token": key, Accept: "application/json" } },
      { service: "Brave", timeout: 8000, baseDelay: 600, maxRetries: 1 }
    );
    const data: BraveWebResponse = await res.json();
    const rawResults =
      options.kind === "news" ? data.results ?? [] : data.web?.results ?? [];

    const mapped = rawResults
      .map((r) => mapBraveResult(r, tag))
      .filter((r): r is UnifiedSearchResult => r !== null);
    const results = options.limit ? mapped.slice(0, options.limit) : mapped;

    breaker.onSuccess();
    return { results, total: results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[Brave] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, { hasApiKey: true }),
    };
  }
}
