import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { okStatus, classifyFetchError, type SourceStatus } from "@/lib/search/source-status";
import type { UnifiedSearchResult } from "@/types/search";

const breaker = createCircuitBreaker({ service: "YouTube", failureThreshold: 5 });

// YouTube Data API quota is metered per DAY (10k units; search = 100 units → ~100
// searches/day free), not per second. Pace modestly to smooth bursts; the real
// cost control is the opt-in Videos tab (we only call when the user asks for it).
const limiter = createOutboundLimiter({
  service: "YouTube",
  requestsPerSecond: 5,
  burst: 2,
});

const ENDPOINT = "https://www.googleapis.com/youtube/v3/search";

// search = 100 units; capped at the API max of 50 results per call.
const YOUTUBE_RESULT_CAP = 25;

export interface YouTubeSearchOptions {
  limit?: number;
}

interface YouTubeThumbnail {
  url?: string;
}
interface YouTubeSnippet {
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  title?: string;
  description?: string;
  thumbnails?: { default?: YouTubeThumbnail; medium?: YouTubeThumbnail; high?: YouTubeThumbnail };
}
interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: YouTubeSnippet;
}
interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  pageInfo?: { totalResults?: number };
  error?: { message?: string };
}

/** YouTube snippet text is HTML-entity-escaped (&amp; &#39; &quot; …) — decode it. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapYouTubeResult(item: YouTubeSearchItem, tag = "videos"): UnifiedSearchResult | null {
  const videoId = item.id?.videoId;
  const title = decodeEntities(item.snippet?.title ?? "");
  if (!videoId || !title) return null;

  const snippet = item.snippet ?? {};
  const channel = decodeEntities(snippet.channelTitle ?? "");
  const description = decodeEntities(snippet.description ?? "");
  const publishedAt = snippet.publishedAt || undefined;
  const year = publishedAt ? parseInt(publishedAt.slice(0, 4), 10) || 0 : 0;

  return {
    title,
    authors: channel ? [channel] : [],
    journal: channel,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    domain: "youtube.com",
    year,
    publishedAt,
    sourceLabel: channel || "YouTube",
    abstract: description || undefined,
    citationCount: 0,
    publicationTypes: [tag],
    isOpenAccess: true,
    sources: [tag],
  };
}

export async function searchYouTube(
  query: string,
  options: YouTubeSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return {
      results: [],
      total: 0,
      status: { status: "missing_config", message: "YOUTUBE_API_KEY not set" },
    };
  }
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent YouTube failures" },
    };
  }

  const maxResults = Math.min(options.limit ?? YOUTUBE_RESULT_CAP, 50);
  const url = new URL(ENDPOINT);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", key);

  try {
    await limiter.acquire();
    const res = await resilientFetch(
      url.toString(),
      { headers: { Accept: "application/json" } },
      { service: "YouTube", timeout: 8000, baseDelay: 600, maxRetries: 1 }
    );
    const data = (await res.json()) as YouTubeSearchResponse;

    if (data.error) {
      breaker.onFailure();
      return {
        results: [],
        total: 0,
        status: { status: "error", message: `YouTube: ${data.error.message ?? "API error"}` },
      };
    }

    const results = (data.items ?? [])
      .map((item) => mapYouTubeResult(item, "videos"))
      .filter((r): r is UnifiedSearchResult => r !== null);

    breaker.onSuccess();
    return { results, total: data.pageInfo?.totalResults ?? results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[YouTube] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, { hasApiKey: true }),
    };
  }
}
