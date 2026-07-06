import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { normalizeDomain } from "@/lib/search/domain-utils";
import { okStatus, classifyFetchError, type SourceStatus } from "@/lib/search/source-status";
import type { UnifiedSearchResult } from "@/types/search";

const breaker = createCircuitBreaker({ service: "NewsData", failureThreshold: 5 });

// NewsData.io's free tier allows ~30 credits / 15 min. Pace to ~1 req / 2s so a
// burst of news queries on a warm instance stays clear of the per-window cap.
const limiter = createOutboundLimiter({
  service: "NewsData",
  requestsPerSecond: 0.5,
  burst: 1,
});

const ENDPOINT = "https://newsdata.io/api/1/latest";

export interface NewsDataSearchOptions {
  limit?: number;
}

interface NewsDataRawArticle {
  article_id?: string;
  link?: string;
  title?: string;
  description?: string | null;
  content?: string | null;
  /** NewsData stamp, UTC, format "YYYY-MM-DD HH:MM:SS". */
  pubDate?: string;
  source_id?: string;
  source_name?: string;
  source_url?: string;
  source_priority?: number;
  duplicate?: boolean;
}

interface NewsDataResponse {
  status?: string;
  totalResults?: number;
  results?: NewsDataRawArticle[];
  nextPage?: string | null;
  message?: string;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clean(text: string | null | undefined): string {
  return collapseWhitespace(text ?? "");
}

function domainOf(link: string, sourceUrl?: string | null): string {
  for (const candidate of [sourceUrl, link]) {
    if (!candidate) continue;
    try {
      return normalizeDomain(candidate) ?? new URL(candidate).hostname.replace(/^www\./, "");
    } catch {
      // try the next candidate
    }
  }
  return "";
}

/** Parse NewsData's "YYYY-MM-DD HH:MM:SS" (UTC) stamp into an ISO string + year. */
export function parseNewsDataDate(pubDate: string | undefined): { iso?: string; year: number } {
  const m = pubDate?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return { year: 0 };
  const [, y, mo, d, h, mi, s] = m;
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, year: parseInt(y, 10) };
}

export function mapNewsDataResult(
  raw: NewsDataRawArticle,
  tag = "news"
): UnifiedSearchResult | null {
  const title = clean(raw.title);
  const url = raw.link ?? "";
  if (!title || !url) return null;

  const domain = domainOf(url, raw.source_url);
  const { iso, year } = parseNewsDataDate(raw.pubDate);
  const abstract = clean(raw.description) || clean(raw.content) || undefined;
  const sourceLabel = raw.source_name || domain;

  return {
    title,
    authors: [],
    journal: sourceLabel,
    url,
    domain,
    year,
    publishedAt: iso,
    sourceLabel,
    abstract,
    citationCount: 0,
    publicationTypes: [tag],
    isOpenAccess: false,
    sources: [tag],
  };
}

export async function searchNewsData(
  query: string,
  options: NewsDataSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) {
    return {
      results: [],
      total: 0,
      status: { status: "missing_config", message: "NEWSDATA_API_KEY not set" },
    };
  }
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent NewsData failures" },
    };
  }

  const url = new URL(ENDPOINT);
  // qInMeta matches title + description + keywords (NOT full body), so the topic
  // must be what the article is ABOUT — this drops the off-topic body-text matches
  // a raw `q` surfaces (e.g. a celebrity story that merely mentions "Ozempic").
  url.searchParams.set("qInMeta", query);
  url.searchParams.set("language", "en");
  // prioritydomain=top restricts to NewsData's curated high-authority outlets,
  // dropping the conspiracy/SEO-farm sources a raw full-text match surfaces.
  url.searchParams.set("prioritydomain", "top");
  url.searchParams.set("removeduplicate", "1");

  try {
    await limiter.acquire();
    const res = await resilientFetch(
      url.toString(),
      { headers: { Accept: "application/json", "X-ACCESS-KEY": key } },
      { service: "NewsData", timeout: 8000, baseDelay: 600, maxRetries: 1 }
    );
    const data = (await res.json()) as NewsDataResponse;

    if (data.status && data.status !== "success") {
      breaker.onFailure();
      return {
        results: [],
        total: 0,
        status: { status: "error", message: `NewsData: ${data.message ?? data.status}` },
      };
    }

    const mapped = (data.results ?? [])
      .filter((a) => !a.duplicate)
      .map((a) => mapNewsDataResult(a, "news"))
      .filter((r): r is UnifiedSearchResult => r !== null);
    const results = options.limit ? mapped.slice(0, options.limit) : mapped;

    breaker.onSuccess();
    return { results, total: data.totalResults ?? results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[NewsData] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, { hasApiKey: true }),
    };
  }
}
