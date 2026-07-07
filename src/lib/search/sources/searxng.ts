import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { normalizeDomain } from "@/lib/search/domain-utils";
import type { UnifiedSearchResult } from "@/types/search";

const breaker = createCircuitBreaker({
  service: "SearXNG",
  failureThreshold: 5,
});

export type SearXNGCategory = "general" | "news" | "social media";
type SearXNGSource = "web" | "news" | "discussions";

interface SearXNGSearchOptions {
  category: SearXNGCategory;
  limit?: number;
  timeRange?: "24h" | "week" | "month" | "year";
}

interface SearXNGResult {
  url: string;
  title: string;
  content?: string | null;
  metadata?: string | null;
  category?: string | null;
  publishedDate?: string | null;
  pubdate?: string | null;
}

interface SearXNGResponse {
  number_of_results?: number;
  results?: SearXNGResult[];
}

export interface SearXNGSearchResponse {
  results: UnifiedSearchResult[];
  total: number;
  degraded: boolean;
}

const CATEGORY_TO_SOURCE: Record<SearXNGCategory, SearXNGSource> = {
  general: "web",
  news: "news",
  "social media": "discussions",
};

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function getDomainLabel(url: string): string {
  try {
    return normalizeDomain(url) ?? new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseSourceLabel(
  result: SearXNGResult,
  source: SearXNGSource
): string {
  const metadata = collapseWhitespace(result.metadata ?? "");
  const parts = parseMetadataParts(result);

  if (source === "discussions") {
    const platform = parts.find((part) => !looksLikeRelativeTime(part));
    if (platform) return platform;
  }

  if (metadata.includes("|")) {
    const lastPart = parts[parts.length - 1];
    if (lastPart) return lastPart;
  }

  if (metadata) return metadata;
  return getDomainLabel(result.url);
}

function parseMetadataParts(result: SearXNGResult): string[] {
  return collapseWhitespace(result.metadata ?? "")
    .split("|")
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
}

function looksLikeRelativeTime(value: string): boolean {
  return /(\d+\s+(minute|hour|day|week|month|year)s?\s+ago|yesterday|today)/i.test(
    value
  );
}

function extractDiscussionMetadata(result: SearXNGResult): {
  platform?: string;
  community?: string;
  engagement?: string;
} {
  const parts = parseMetadataParts(result);
  const contentParts = parts.filter((part) => !looksLikeRelativeTime(part));

  return {
    platform: contentParts[0] || undefined,
    community: contentParts[1] || undefined,
    engagement: contentParts.slice(2).join(" · ") || undefined,
  };
}

function parseYear(result: SearXNGResult): number {
  const rawDate = result.publishedDate || result.pubdate || "";
  const yearMatch = rawDate.match(/(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1], 10) : 0;
}

function normalizeCategory(category: string | null | undefined): SearXNGCategory {
  if (category === "news") return "news";
  if (category === "social media") return "social media";
  return "general";
}

function mapResult(
  result: SearXNGResult,
  requestedCategory: SearXNGCategory
): UnifiedSearchResult | null {
  const title = collapseWhitespace(result.title || "");
  if (!title) return null;

  const mappedSource = CATEGORY_TO_SOURCE[normalizeCategory(requestedCategory)];
  const abstract = collapseWhitespace(stripHtml(result.content ?? ""));
  const publishedAt = result.publishedDate || result.pubdate || undefined;
  const discussionMetadata =
    mappedSource === "discussions" ? extractDiscussionMetadata(result) : {};

  return {
    title,
    authors: [],
    journal: parseSourceLabel(result, mappedSource),
    url: result.url,
    domain: getDomainLabel(result.url),
    year: parseYear(result),
    publishedAt,
    sourceLabel: parseSourceLabel(result, mappedSource),
    platform: discussionMetadata.platform,
    community: discussionMetadata.community,
    engagement: discussionMetadata.engagement,
    abstract: abstract || undefined,
    citationCount: 0,
    publicationTypes: [mappedSource],
    isOpenAccess: false,
    sources: [mappedSource],
  };
}

export async function searchSearXNG(
  query: string,
  options: SearXNGSearchOptions
): Promise<SearXNGSearchResponse> {
  if (!breaker.canRequest()) {
    console.warn("[SearXNG] Circuit open — skipping");
    return { results: [], total: 0, degraded: true };
  }

  const baseUrl = process.env.SEARXNG_URL;
  if (!baseUrl) {
    console.warn("[SearXNG] SEARXNG_URL is not configured");
    return { results: [], total: 0, degraded: true };
  }

  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("categories", options.category);
  if (options.timeRange) {
    // SearXNG time_range param: "day", "week", "month", "year"
    const timeRangeMap: Record<string, string> = {
      "24h": "day",
      week: "week",
      month: "month",
      year: "year",
    };
    url.searchParams.set("time_range", timeRangeMap[options.timeRange] ?? "");
  }

  try {
    const res = await resilientFetch(url.toString(), undefined, {
      service: "SearXNG",
      timeout: 4500,
      baseDelay: 400,
      maxRetries: 0,
    });
    const data: SearXNGResponse = await res.json();

    const normalizedResults = (data.results || [])
      .map((result) => mapResult(result, options.category))
      .filter((result): result is UnifiedSearchResult => result !== null);
    const results = options.limit
      ? normalizedResults.slice(0, options.limit)
      : normalizedResults;
    const total = data.number_of_results ?? normalizedResults.length;

    breaker.onSuccess();
    return {
      results,
      total,
      degraded: false,
    };
  } catch (error) {
    breaker.onFailure();
    console.error("[SearXNG] Search failed:", error);
    return { results: [], total: 0, degraded: true };
  }
}
