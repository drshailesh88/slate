/**
 * Stack Exchange discussions source via the public Stack Exchange API
 * (https://api.stackexchange.com/2.3/search/advanced — no key required, but
 * keyless requests share a per-IP daily quota). Queries a curated set of
 * research-relevant sites (Cross Validated, Academia) and returns real question
 * threads as UnifiedSearchResult[] tagged sources:["discussions"].
 *
 * Fail-open: every site call is independently guarded; on any error / circuit
 * open the source yields an empty, non-ok status and never zeroes the tab.
 */
import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { classifyFetchError, okStatus, type SourceStatus } from "@/lib/search/source-status";
import { toKeywordQuery } from "@/lib/search/web/query-terms";

const breaker = createCircuitBreaker({ service: "StackExchange", failureThreshold: 5 });

const SE_SEARCH_URL = "https://api.stackexchange.com/2.3/search/advanced";

/** Research-relevant SE sites. api_site_parameter → display label. */
const DEFAULT_SITES: ReadonlyArray<{ site: string; label: string }> = [
  { site: "stats", label: "Cross Validated" },
  { site: "academia", label: "Academia" },
];

interface SeItem {
  title: string;
  link: string;
  score?: number;
  answer_count?: number;
  creation_date?: number;
  last_activity_date?: number;
  tags?: string[];
}

interface SeResponse {
  items?: SeItem[];
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#39": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);?/g, (m) => HTML_ENTITIES[m] ?? m);
}

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function toUnified(item: SeItem, siteLabel: string): UnifiedSearchResult | null {
  const title = decodeEntities((item.title ?? "").trim());
  if (!title || !item.link) return null;
  const created = item.creation_date ? new Date(item.creation_date * 1000).toISOString() : undefined;
  const parts: string[] = [];
  if (typeof item.score === "number") parts.push(`${item.score} votes`);
  if (typeof item.answer_count === "number") parts.push(`${item.answer_count} answers`);
  return {
    title,
    authors: [],
    journal: siteLabel,
    url: item.link,
    domain: domainOf(item.link),
    year: created ? new Date(created).getUTCFullYear() : 0,
    publishedAt: created,
    sourceLabel: siteLabel,
    platform: "Stack Exchange",
    community: siteLabel,
    engagement: parts.length ? parts.join(" · ") : undefined,
    abstract: undefined,
    citationCount: 0,
    publicationTypes: ["discussions"],
    isOpenAccess: false,
    sources: ["discussions"],
    trustTier: "community",
  };
}

async function searchSite(
  query: string,
  site: string,
  label: string,
  limit: number
): Promise<UnifiedSearchResult[]> {
  const url = new URL(SE_SEARCH_URL);
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("q", toKeywordQuery(query));
  url.searchParams.set("site", site);
  url.searchParams.set("pagesize", String(limit));
  const res = await resilientFetch(url.toString(), undefined, {
    service: "StackExchange",
    timeout: 8000,
    baseDelay: 400,
    maxRetries: 1,
  });
  const data: SeResponse = await res.json();
  return (data.items ?? [])
    .map((item) => toUnified(item, label))
    .filter((r): r is UnifiedSearchResult => r !== null);
}

export async function searchStackExchange(
  query: string,
  options: { limit?: number; sites?: ReadonlyArray<{ site: string; label: string }> } = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    return { results: [], total: 0, status: { status: "error", message: "Circuit breaker open — recent Stack Exchange failures" } };
  }
  const sites = options.sites ?? DEFAULT_SITES;
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 30);

  const settled = await Promise.allSettled(
    sites.map((s) => searchSite(query, s.site, s.label, limit))
  );

  const results: UnifiedSearchResult[] = [];
  let anyFulfilled = false;
  let lastError: unknown;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      anyFulfilled = true;
      results.push(...r.value);
    } else {
      lastError = r.reason;
    }
  }

  if (!anyFulfilled) {
    breaker.onFailure();
    return { results: [], total: 0, status: classifyFetchError(lastError) };
  }
  breaker.onSuccess();
  return { results, total: results.length, status: okStatus() };
}
