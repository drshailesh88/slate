/**
 * Non-academic federation: fan a query out across a per-tab set of sources in
 * parallel, each fail-open and timeout-bounded, then RRF-fuse the survivors on
 * canonical URL. A single source short-circuits to a passthrough (no reorder, no
 * rrfScore) so a SearXNG-only configuration reproduces the legacy single-source
 * path byte-for-byte — the property CYCLE 0 validates.
 *
 * Lives entirely outside the academic engine: only the non-academic branch of
 * the unified route calls this.
 */
import type { UnifiedSearchResult } from "@/types/search";
import { okStatus, classifyRejectionReason, type SourceStatus } from "@/lib/search/source-status";
import { sourceBudget } from "@/lib/search/web/source-budget";
import { searchSearXNG, type SearXNGCategory } from "@/lib/search/sources/searxng";
import { searchBrave } from "@/lib/search/sources/brave";
import { searchNewsData } from "@/lib/search/sources/newsdata";
import { searchExa } from "@/lib/search/sources/exa";
import { searchHackerNews } from "@/lib/search/sources/hacker-news";
import { searchStackExchange } from "@/lib/search/sources/stackexchange";
import { reciprocalRankFusionWeb } from "./rank-fusion-web";
import { canonicalUrl } from "./canonical-url";

export type FederatedTab = "web" | "news" | "discussions";

export interface FederateOptions {
  limit?: number;
  timeRange?: "24h" | "week" | "month" | "year";
  /** Per-source wall-clock ceiling. A slow source is dropped, never blocking. */
  timeoutMs?: number;
}

export interface WebSourceResult {
  results: UnifiedSearchResult[];
  total: number;
  status: SourceStatus;
}

export interface WebSource {
  id: string;
  label: string;
  run: (query: string, options: FederateOptions) => Promise<WebSourceResult>;
  /**
   * RRF contribution multiplier (default 1). A recency-only supplement is given
   * a weight < 1 so it adds fresh coverage without out-voting the authority-ranked
   * engines and flooding the fused top-K.
   */
  weight?: number;
  /**
   * When set and this source returns results, its NATIVE order LEADS the fused
   * list and the other sources fill the deduped tail below it — no RRF blend over
   * the head, and the caller skips the cross-encoder rerank (`primaryLed`). Used
   * for a neural engine (Exa) whose own ranking measured better than our fusion +
   * rerank: blending it co-equal and reranking diluted it. If the primary returns
   * nothing (unkeyed/down), federation falls back to normal weighted RRF.
   */
  primary?: boolean;
}

export interface FederationResult {
  results: UnifiedSearchResult[];
  perSource: Array<{ id: string; label: string; count: number; status: SourceStatus }>;
  /** Per-source raw rows — debug/provenance only (e.g. the capture provider tag). */
  perSourceRows: Array<{ id: string; results: UnifiedSearchResult[] }>;
  degraded: boolean;
  /**
   * True when a `primary` source led the ordering (its native order preserved at
   * the head). The caller MUST NOT cross-encoder-rerank a primary-led list — the
   * rerank is what diluted the primary engine's ranking. False → normal RRF, the
   * caller may rerank.
   */
  primaryLed: boolean;
}

const DEFAULT_SOURCE_TIMEOUT_MS = 9000;

const SEARXNG_CATEGORY_BY_TAB: Record<FederatedTab, SearXNGCategory> = {
  web: "general",
  news: "news",
  discussions: "social media",
};

export function searxngSourceForTab(tab: FederatedTab): WebSource {
  const category = SEARXNG_CATEGORY_BY_TAB[tab];
  return {
    id: "searxng",
    label: `SearXNG (${category})`,
    run: async (query, options) => {
      const r = await searchSearXNG(query, {
        category,
        limit: options.limit,
        timeRange: options.timeRange,
      });
      return {
        results: r.results,
        total: r.total,
        status: r.degraded
          ? { status: "error", message: "SearXNG degraded" }
          : okStatus(),
      };
    },
  };
}

/**
 * Brave as an independent index. web/news hit their dedicated endpoints; the
 * discussions adapter rides the web endpoint with a `site:reddit.com` filter to
 * harvest Reddit threads, since Reddit's own API is closed (403) as of 2026.
 */
export function braveSourceForTab(tab: FederatedTab): WebSource {
  if (tab === "news") {
    return {
      id: "brave-news",
      label: "Brave News",
      run: (query, options) =>
        searchBrave(query, { kind: "news", limit: options.limit, timeRange: options.timeRange }),
    };
  }
  if (tab === "discussions") {
    return {
      id: "brave-reddit",
      label: "Brave (Reddit)",
      run: (query, options) =>
        searchBrave(query, {
          kind: "web",
          limit: options.limit,
          siteFilter: "reddit.com",
          tag: "discussions",
        }),
    };
  }
  return {
    id: "brave",
    label: "Brave Web",
    run: (query, options) =>
      searchBrave(query, { kind: "web", limit: options.limit, timeRange: options.timeRange }),
  };
}

/**
 * NewsData.io — a fast (~1s), relevance-ranked news index restricted to its
 * curated top-priority outlets (`prioritydomain=top`), so it adds high-authority
 * recent coverage with real abstracts that SearXNG-news and Brave-News miss.
 * (Chosen over GDELT, which was 12–25s and matched on noisy full body text.)
 */
// A recency supplement should add a few fresh items, not crowd the page: cap its
// row count so it can't fill the fused top-K even when it returns a full page.
const NEWSDATA_SUPPLEMENT_CAP = 6;

const newsDataSource: WebSource = {
  id: "newsdata",
  label: "NewsData.io",
  // Recency supplement: down-weighted in fusion so its fresh rows fill gaps below
  // the authority-ranked SearXNG/Brave results rather than flooding the top-K.
  weight: 0.5,
  run: (query, options) =>
    searchNewsData(query, {
      limit: Math.min(options.limit ?? NEWSDATA_SUPPLEMENT_CAP, NEWSDATA_SUPPLEMENT_CAP),
    }),
};

/**
 * Exa — a neural/embeddings web index. It surfaces authoritative documents the
 * keyword engines (SearXNG, Brave) never return. WEB-COUNCIL-5 measured that
 * blending Exa co-equal and then reranking DILUTED it (council 5: raw Exa 6/2), and
 * so did domain-diversity (council 6: 3/1). So on the **web** tab Exa is PRIMARY: its
 * native top-10 leads VERBATIM and SearXNG/Brave fill the deduped tail (positions 11+)
 * + serve as the unkeyed fallback; the caller (`primaryLed`) skips BOTH the rerank and
 * the diversity that diluted it. On **news** (a measured tie) Exa stays a co-equal RRF
 * source. numResults is capped to 10 inside the source to hold the cost tier. Dormant
 * until EXA_API_KEY is set (missing_config → contributes nothing, fail-open) — on web,
 * an unkeyed Exa simply falls back to keyword RRF + rerank + diversity.
 */
function exaSourceForTab(tab: FederatedTab): WebSource {
  return {
    id: "exa",
    label: tab === "news" ? "Exa (news)" : "Exa",
    primary: tab === "web",
    run: (query, options) =>
      searchExa(query, { tab, limit: options.limit, timeRange: options.timeRange }),
  };
}

const hackerNewsSource: WebSource = {
  id: "hacker-news",
  label: "Hacker News",
  run: (query, options) => searchHackerNews(query, { limit: options.limit }),
};

const stackExchangeSource: WebSource = {
  id: "stackexchange",
  label: "Stack Exchange",
  run: (query, options) => searchStackExchange(query, { limit: options.limit }),
};

/**
 * Per-tab source set. web/news federate SearXNG with Brave's independent index
 * (Brave surfaces authoritative explainers + diverse outlets that SearXNG's
 * keyword scrape misses) and Exa's neural index (the recall engine — it returns
 * documents the keyword engines miss); news adds NewsData.io's top-priority outlet
 * index for high-authority recent coverage. Discussions federates the real-thread verticals —
 * Hacker News + Stack Exchange APIs plus Reddit threads via Brave's `site:`
 * index (Reddit's own API is dead). SearXNG "social media" is excluded (it
 * returns fediverse noise and measured worse).
 */
export const SOURCES_BY_TAB: Record<FederatedTab, WebSource[]> = {
  web: [searxngSourceForTab("web"), braveSourceForTab("web"), exaSourceForTab("web")],
  news: [searxngSourceForTab("news"), braveSourceForTab("news"), newsDataSource, exaSourceForTab("news")],
  discussions: [hackerNewsSource, stackExchangeSource, braveSourceForTab("discussions")],
};

async function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function federateWith(
  query: string,
  _tab: FederatedTab,
  sources: WebSource[],
  options: FederateOptions = {}
): Promise<FederationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;

  const settled = await Promise.all(
    sources.map(async (source) => {
      // Paid-source budget guardrail: once a metered family (Exa/Brave/NewsData) hits
      // its daily cap, skip it and let the federation degrade to the remaining free
      // lanes rather than spend more. Free sources are never capped.
      if (!(await sourceBudget.canSpend(source.id))) {
        return {
          id: source.id,
          label: source.label,
          results: [] as UnifiedSearchResult[],
          total: 0,
          status: { status: "rate_limited" as const, message: "daily budget cap reached" },
        };
      }
      try {
        await sourceBudget.recordSpend(source.id);
        const r = await withTimeout(source.id, source.run(query, options), timeoutMs);
        return { id: source.id, label: source.label, ...r };
      } catch (error) {
        return {
          id: source.id,
          label: source.label,
          results: [] as UnifiedSearchResult[],
          total: 0,
          status: classifyRejectionReason(error),
        };
      }
    })
  );

  const lists = settled
    .filter((s) => s.results.length > 0)
    .map((s) => ({ source: s.id, results: s.results }));

  const weights = Object.fromEntries(sources.map((s) => [s.id, s.weight ?? 1]));

  // A `primary` source that returned results LEADS in its native order; the other
  // sources fill the deduped tail (RRF'd among themselves). No rerank downstream
  // (`primaryLed`) so the primary engine's measured-better ranking survives intact.
  const primaryId = sources.find((s) => s.primary)?.id;
  const primaryList = primaryId ? lists.find((l) => l.source === primaryId) : undefined;

  let results: UnifiedSearchResult[];
  let primaryLed = false;
  if (primaryList && primaryList.results.length > 0) {
    const seen = new Set(primaryList.results.map((r) => (r.url ? canonicalUrl(r.url) : r.title)));
    const rest = lists.filter((l) => l.source !== primaryId);
    const restFused =
      rest.length === 0
        ? []
        : rest.length === 1
          ? rest[0].results
          : reciprocalRankFusionWeb(rest, 60, weights);
    const tail = restFused.filter((r) => !seen.has(r.url ? canonicalUrl(r.url) : r.title));
    results = [...primaryList.results, ...tail];
    primaryLed = true;
  } else {
    // Single contributing source → passthrough (no reorder, no rrfScore) so a
    // one-source federation is byte-identical to the legacy direct call.
    results =
      lists.length <= 1 ? (lists[0]?.results ?? []) : reciprocalRankFusionWeb(lists, 60, weights);
  }

  const anyOk = settled.some((s) => s.status.status === "ok");
  const degraded = !anyOk && results.length === 0;

  return {
    results,
    perSource: settled.map((s) => ({ id: s.id, label: s.label, count: s.results.length, status: s.status })),
    perSourceRows: settled.map((s) => ({ id: s.id, results: s.results })),
    degraded,
    primaryLed,
  };
}

export async function federateNonAcademic(
  query: string,
  tab: FederatedTab,
  options: FederateOptions = {}
): Promise<FederationResult> {
  return federateWith(query, tab, SOURCES_BY_TAB[tab], options);
}
