import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { normalizeDomain } from "@/lib/search/domain-utils";
import { okStatus, classifyFetchError, type SourceStatus } from "@/lib/search/source-status";
import type { UnifiedSearchResult } from "@/types/search";

const breaker = createCircuitBreaker({ service: "Exa", failureThreshold: 5 });

// Exa's free tier is request-count metered (~20k/month), not a tight per-second
// cap. Pace generously — Exa is fast (~1s) and we only ever fire one request per
// federated query — while still smoothing a burst on a warm instance.
const limiter = createOutboundLimiter({
  service: "Exa",
  requestsPerSecond: 5,
  burst: 2,
});

const ENDPOINT = "https://api.exa.ai/search";

// Exa bills $7/1k for the first 10 results, then +$1/1k per extra result. Hard-cap
// numResults at the 10-result tier so a federation `limit` of 100 can't silently
// turn each query into a ~$97/1k call. Exa is the recall engine, not a deep pager.
const EXA_RESULT_CAP = 10;

/** The non-academic tab a result is tagged with. */
export type ExaTab = "web" | "news" | "discussions";

export interface ExaSearchOptions {
  tab: ExaTab;
  limit?: number;
  timeRange?: "24h" | "week" | "month" | "year";
}

interface ExaRawResult {
  title?: string;
  url?: string;
  publishedDate?: string | null;
  text?: string | null;
  highlights?: string[] | null;
}

interface ExaResponse {
  results?: ExaRawResult[];
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function domainOf(url: string): string {
  try {
    return normalizeDomain(url) ?? new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Exa returns `publishedDate` as either a full ISO timestamp or a bare
 * `YYYY-MM-DD`. Keep the original string as `iso` (it is already ISO-ordered) and
 * pull the leading year; a missing/unparseable date yields year 0 and no iso.
 */
export function parseExaDate(publishedDate: string | null | undefined): {
  iso?: string;
  year: number;
} {
  const m = publishedDate?.match(/^(\d{4})-\d{2}-\d{2}/);
  if (!m) return { year: 0 };
  return { iso: publishedDate ?? undefined, year: parseInt(m[1], 10) };
}

/** web = general semantic search (no filter); news = Exa's news category. */
export function exaCategoryForTab(tab: ExaTab): string | undefined {
  return tab === "news" ? "news" : undefined;
}

export function mapExaResult(raw: ExaRawResult, tag: ExaTab): UnifiedSearchResult | null {
  const title = collapseWhitespace(raw.title ?? "");
  const url = raw.url ?? "";
  if (!title || !url) return null;

  const snippetSource = raw.text ?? (raw.highlights ?? []).join(" ");
  const abstract = collapseWhitespace(snippetSource) || undefined;
  const domain = domainOf(url);
  const { iso, year } = parseExaDate(raw.publishedDate);

  return {
    title,
    authors: [],
    journal: domain,
    url,
    domain,
    year,
    publishedAt: iso,
    sourceLabel: domain,
    abstract,
    citationCount: 0,
    publicationTypes: [tag],
    isOpenAccess: false,
    sources: [tag],
  };
}

/** Map the unified timeRange vocabulary to an Exa `startPublishedDate` (YYYY-MM-DD). */
export function exaStartDate(timeRange?: "24h" | "week" | "month" | "year"): string | undefined {
  if (!timeRange) return undefined;
  const days = { "24h": 1, week: 7, month: 30, year: 365 }[timeRange];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return since.toISOString().slice(0, 10);
}

export async function searchExa(
  query: string,
  options: ExaSearchOptions
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    return {
      results: [],
      total: 0,
      status: { status: "missing_config", message: "EXA_API_KEY not set" },
    };
  }
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Exa failures" },
    };
  }

  const numResults = Math.min(options.limit ?? EXA_RESULT_CAP, EXA_RESULT_CAP);
  const category = exaCategoryForTab(options.tab);
  const startPublishedDate = exaStartDate(options.timeRange);
  const body = {
    query,
    type: "auto",
    numResults,
    ...(category ? { category } : {}),
    ...(startPublishedDate ? { startPublishedDate } : {}),
    contents: { text: { maxCharacters: 400 } },
  };

  try {
    await limiter.acquire();
    const res = await resilientFetch(
      ENDPOINT,
      {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      { service: "Exa", timeout: 8000, baseDelay: 600, maxRetries: 1 }
    );
    const data = (await res.json()) as ExaResponse;

    const mapped = (data.results ?? [])
      .map((r) => mapExaResult(r, options.tab))
      .filter((r): r is UnifiedSearchResult => r !== null);

    breaker.onSuccess();
    return { results: mapped, total: mapped.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[Exa] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, { hasApiKey: true }),
    };
  }
}
