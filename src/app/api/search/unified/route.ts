import { NextResponse } from "next/server";
import type { SearchResponse } from "@/types/search";
import { runLiteratureSearch } from "@/lib/search/run-search";
import { federateNonAcademic } from "@/lib/search/web/federate";
import { searchResultCache, buildCacheKey, type CacheHit } from "@/lib/search/result-cache";
import { nonAcademicCacheTtl, shouldCacheFederatedList } from "@/lib/search/web/cache-policy";
import { searchYouTube } from "@/lib/search/sources/youtube";
import { rerankResults } from "@/lib/search/rerank";
import { diversifyForTab } from "@/lib/search/diversity";
import { applyNewsAuthorityFloor } from "@/lib/search/web/news-authority";
import { getDomainConfig } from "@/lib/search/domains";
import { augmentQuery } from "@/lib/ai/query-augment";
import { getCurrentUserId } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getDevelopmentFallbackResults } from "@/lib/search/dev-fallback";
import { getDomainPreferences } from "@/lib/actions/domain-preferences";
import { getUserScopes, type ScopeRecord } from "@/lib/actions/scopes";
import { getTrustTier } from "@/lib/search/trust-tier";
import { normalizeDomain } from "@/lib/search/domain-utils";
import type { UnifiedSearchResult } from "@/types/search";

// The academic tab fans out across 4 lexical lanes + the owned dense floor + a
// cross-encoder rerank; a multi-source literature search legitimately runs ~8-12s.
// Give the function room so Vercel doesn't kill it at the ~10s default.
export const maxDuration = 60;

type ResultDomainPreferenceLevel = NonNullable<
  UnifiedSearchResult["domainPreferenceLevel"]
>;

type SearchTab = "academic" | "web" | "news" | "discussions" | "videos";

const DOMAIN_PREFERENCE_WEIGHT: Record<ResultDomainPreferenceLevel, number> = {
  mute: -99,
  lower: -1,
  neutral: 0,
  higher: 1,
  prefer: 2,
};
const MAX_NON_ACADEMIC_RESULTS = 100;

function isSearchTab(tab: string): tab is SearchTab {
  return (
    tab === "academic" ||
    tab === "web" ||
    tab === "news" ||
    tab === "discussions" ||
    tab === "videos"
  );
}

function addTrustTier(result: UnifiedSearchResult): UnifiedSearchResult {
  const normalizedDomain =
    result.domain ?? (result.url ? normalizeDomain(result.url) : null) ?? undefined;

  return {
    ...result,
    domain: normalizedDomain,
    trustTier: result.trustTier ?? getTrustTier(normalizedDomain ?? result.url),
  };
}

function applyScopeFilter(
  results: UnifiedSearchResult[],
  scope: ScopeRecord
): UnifiedSearchResult[] {
  return results.filter((result) => {
    const resultDomain = result.domain ?? "";

    // Include filter: result domain must match one of the included domains
    if (scope.includedDomains.length > 0) {
      const matches = scope.includedDomains.some(
        (d) => resultDomain === d || resultDomain.endsWith(`.${d}`)
      );
      if (!matches) return false;
    }

    // Exclude filter: result domain must NOT match any excluded domain
    if (scope.excludedDomains.length > 0) {
      const excluded = scope.excludedDomains.some(
        (d) => resultDomain === d || resultDomain.endsWith(`.${d}`)
      );
      if (excluded) return false;
    }

    // Keyword include: title or abstract must contain at least one keyword
    if (scope.includedKeywords.length > 0) {
      const text = `${result.title} ${result.abstract ?? ""} ${result.tldr ?? ""}`.toLowerCase();
      const matches = scope.includedKeywords.some((kw) =>
        text.includes(kw.toLowerCase())
      );
      if (!matches) return false;
    }

    // Keyword exclude: title or abstract must NOT contain any excluded keyword
    if (scope.excludedKeywords.length > 0) {
      const text = `${result.title} ${result.abstract ?? ""} ${result.tldr ?? ""}`.toLowerCase();
      const excluded = scope.excludedKeywords.some((kw) =>
        text.includes(kw.toLowerCase())
      );
      if (excluded) return false;
    }

    return true;
  });
}

function applyDomainPreferences(
  results: UnifiedSearchResult[],
  preferences: Awaited<ReturnType<typeof getDomainPreferences>>
): UnifiedSearchResult[] {
  if (preferences.length === 0) {
    return results.map((result) => ({
      ...addTrustTier(result),
      domainPreferenceLevel: "neutral",
    }));
  }

  const preferenceMap = new Map(
    preferences.map((preference) => [preference.domain, preference.level])
  );

  return results
    .map((result, index) => {
      const enrichedResult = addTrustTier(result);
      const level: ResultDomainPreferenceLevel = enrichedResult.domain
        ? (preferenceMap.get(enrichedResult.domain) ?? "neutral")
        : "neutral";

      return {
        result: {
          ...enrichedResult,
          domainPreferenceLevel: level,
        },
        index,
        level,
      };
    })
    .filter(({ level }) => level !== "mute")
    .sort((left, right) => {
      const weightDelta =
        DOMAIN_PREFERENCE_WEIGHT[right.level] -
        DOMAIN_PREFERENCE_WEIGHT[left.level];

      if (weightDelta !== 0) return weightDelta;
      return left.index - right.index;
    })
    .map(({ result }) => result);
}

/**
 * Semantic cross-encoder reranking is gated to the WEB tab. WEB-COUNCIL-3 (blinded
 * A/B): web 3-1 with the reranker (incl. demoting a catastrophic off-topic result),
 * but news is a 2-2 wash where it demotes fresh items on a recency-first tab, and it
 * regressed discussions. News/discussions keep their recency/diversity ordering.
 * Fail-open: returns the input unchanged off-tab or if the reranker is down.
 */
async function rerankWebTabOnly(
  query: string,
  results: UnifiedSearchResult[],
  isWebTab: boolean
): Promise<UnifiedSearchResult[]> {
  return isWebTab
    ? rerankResults(query, results, undefined, { domain: "web" })
    : results;
}


/**
 * Federated non-academic path: fan out across the tab's source set, RRF-fuse on
 * canonical URL, then run the SAME quality layer (Cohere rerank + domain
 * preferences) the single-source path uses. The fused pool is already the full
 * available set, so there is no incremental re-fetch loop — we page over it.
 */
/**
 * The query-global, cacheable part of a non-academic search: the expensive fan-out
 * (+ web-tab rerank), independent of the user's domain preferences and the page. This
 * is what gets cached — every page and every user of the same query then shares one
 * paid fan-out. Preferences, diversity, and paging are applied per-request afterwards.
 */
interface NonAcademicList {
  results: UnifiedSearchResult[];
  degraded: boolean;
  primaryLed: boolean;
  /** Per-source contribution, for telemetry (which lanes fired, which were empty/down). */
  perSource: { id: string; count: number; ok: boolean }[];
}

async function computeNonAcademicList(
  query: string,
  tab: "web" | "news" | "discussions" | "videos",
  timeRange?: "24h" | "week" | "month" | "year"
): Promise<NonAcademicList> {
  // Videos is a single-source tab (YouTube) — no federation/rerank; just YouTube's own
  // relevance order. Caching it also shields the scarce 100-searches/day YouTube quota.
  if (tab === "videos") {
    const yt = await searchYouTube(query, { limit: MAX_NON_ACADEMIC_RESULTS });
    const ok = yt.status.status === "ok";
    return {
      results: yt.results,
      degraded: !ok && yt.results.length === 0,
      primaryLed: false,
      perSource: [{ id: "youtube", count: yt.results.length, ok }],
    };
  }

  const federation = await federateNonAcademic(query, tab, {
    limit: MAX_NON_ACADEMIC_RESULTS,
    timeRange,
  });
  // A primary-led list (Exa leading the web tab) keeps its native order VERBATIM:
  // WEB-COUNCIL-5/6 showed every processing layer DILUTED it — the cross-encoder
  // rerank (council 5) and then domain-diversity (council 6, which pulled keyword
  // tail junk up into the visible top-10). So when Exa leads we skip BOTH; Exa's
  // own top-10 is the page (matching raw Exa, which beat every processed variant),
  // and the deduped keyword tail rides positions 11+ as breadth. Rerank + diversity
  // still run on the keyword-only fallback (Exa unkeyed/empty → primaryLed false).
  const reranked = federation.primaryLed
    ? federation.results
    : await rerankWebTabOnly(query, federation.results, tab === "web");
  return {
    results: reranked,
    degraded: federation.degraded,
    primaryLed: federation.primaryLed,
    perSource: federation.perSource.map((s) => ({
      id: s.id,
      count: s.count,
      ok: s.status.status === "ok",
    })),
  };
}

async function fetchFederatedNonAcademicResults(
  query: string,
  tab: "web" | "news" | "discussions" | "videos",
  page: number,
  perPage: number,
  preferences: Awaited<ReturnType<typeof getDomainPreferences>>,
  timeRange?: "24h" | "week" | "month" | "year"
): Promise<{
  results: UnifiedSearchResult[];
  total: number;
  hasMore: boolean;
  degraded: boolean;
  primaryLed: boolean;
  perSource: { id: string; count: number; ok: boolean }[];
  cacheHit: CacheHit;
}> {
  // Cache the query-global fan-out (keyed by tab+query+timeRange, per-tab TTL). The
  // paid tabs (Exa/Brave/NewsData/YouTube) were previously uncached — this is the
  // single biggest cost lever. Degraded/empty responses are never cached.
  const cacheKey = buildCacheKey("websearch:v1", { tab, query, timeRange: timeRange ?? "" });
  const { value: list, hit: cacheHit } = await searchResultCache.getOrCompute(
    cacheKey,
    () => computeNonAcademicList(query, tab, timeRange),
    {
      ttlSeconds: nonAcademicCacheTtl(tab),
      staleSeconds: 6 * 3600,
      shouldCache: shouldCacheFederatedList,
    }
  );

  const start = page * perPage;
  const telemetry = { primaryLed: list.primaryLed, perSource: list.perSource, cacheHit };

  // Videos: raw YouTube order, paged — no preferences/diversity (unchanged behavior).
  if (tab === "videos") {
    return {
      results: list.results.slice(start, start + perPage),
      total: list.results.length,
      hasMore: list.results.length > start + perPage,
      degraded: list.degraded,
      ...telemetry,
    };
  }

  // Per-request (cheap, user-specific): domain preferences + diversity + paging run
  // OUTSIDE the cache so the cache stays query-global (high hit rate, no per-user
  // pollution). Primary-led lists keep their native order (no diversity), as before.
  const ranked = applyDomainPreferences(list.results, preferences);
  const diversified = list.primaryLed ? ranked : diversifyForTab(ranked, tab);
  // News authority floor: a reputation guarantee (not a ranking lever) — surface only
  // credible outlets so a low-trust result can't embarrass a non-core tab. Min-results
  // safeguard backfills so the tab is never emptied. NEWS_AUTHORITY_FLOOR=0 disables it.
  const floored =
    tab === "news" && process.env.NEWS_AUTHORITY_FLOOR !== "0"
      ? applyNewsAuthorityFloor(diversified)
      : diversified;
  return {
    results: floored.slice(start, start + perPage),
    total: floored.length,
    hasMore: floored.length > start + perPage,
    degraded: list.degraded,
    ...telemetry,
  };
}

export async function GET(req: Request) {
  const log = logger.withRequestId();

  // Authentication
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Rate limiting
  const rateLimitResponse = await checkRateLimit(userId, "search", RATE_LIMITS.search);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "0", 10);
  const perPage = Math.min(parseInt(searchParams.get("perPage") || "20", 10), 100);
  const yearStart = searchParams.get("yearStart")
    ? parseInt(searchParams.get("yearStart")!, 10)
    : undefined;
  const yearEnd = searchParams.get("yearEnd")
    ? parseInt(searchParams.get("yearEnd")!, 10)
    : undefined;
  const studyTypes = searchParams.get("studyTypes")
    ? searchParams.get("studyTypes")!.split(",")
    : undefined;
  const openAccessOnly = searchParams.get("openAccessOnly") === "true";
  const augment = searchParams.get("augment") !== "false";
  const sort = searchParams.get("sort") || "relevance";
  const tabParam = searchParams.get("tab") || "academic";
  const VALID_TIME_RANGES = ["24h", "week", "month", "year"] as const;
  const timeRangeRaw = searchParams.get("timeRange");
  if (timeRangeRaw && !VALID_TIME_RANGES.includes(timeRangeRaw as (typeof VALID_TIME_RANGES)[number])) {
    return NextResponse.json(
      { error: "Invalid timeRange. Must be one of: 24h, week, month, year" },
      { status: 400 }
    );
  }
  const timeRange = (timeRangeRaw as (typeof VALID_TIME_RANGES)[number]) ?? undefined;
  const exactMatch = searchParams.get("exactMatch") === "true";
  const usePreferences = searchParams.get("usePreferences") !== "false"; // default true
  const scopeId = searchParams.get("scopeId")
    ? parseInt(searchParams.get("scopeId")!, 10)
    : null;

  if (!q) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  if (q.length > 500) {
    return NextResponse.json(
      { error: "Query parameter 'q' must not exceed 500 characters" },
      { status: 400 }
    );
  }

  if (!isSearchTab(tabParam)) {
    return NextResponse.json(
      { error: "Query parameter 'tab' must be academic, web, news, discussions, or videos" },
      { status: 400 }
    );
  }

  try {
    if (tabParam !== "academic") {
      const userDomainPreferences = usePreferences
        ? await getDomainPreferences()
        : [];
      // Wrap query in quotes for exact match (strip existing quotes to prevent injection)
      const sanitized = q.replace(/"/g, "");
      const effectiveQuery = exactMatch ? `"${sanitized}"` : q;
      const {
        results: paged,
        total: visibleTotal,
        hasMore,
        degraded,
        primaryLed,
        perSource,
        cacheHit,
      } = await fetchFederatedNonAcademicResults(
        effectiveQuery,
        tabParam,
        page,
        perPage,
        userDomainPreferences,
        timeRange as "24h" | "week" | "month" | "year" | undefined
      );

      // Telemetry: makes the silent web-tab degradation visible. On the web tab,
      // `primaryLed: false` means Exa did NOT lead (down/throttled/unkeyed) and we fell
      // back to the keyword stack — alert on a drop in the Exa-led rate. Also surfaces
      // per-source contribution and cache effectiveness.
      log.info("Non-academic search served", {
        tab: tabParam,
        primaryLed,
        cacheHit,
        degraded,
        sources: perSource,
      });

      // Apply scope domain constraints if a custom scope is active
      let scopeFilteredResults = paged;
      if (scopeId && scopeId > 0) {
        const allScopes = await getUserScopes();
        const scope = allScopes.find((s) => s.id === scopeId);
        if (scope) {
          scopeFilteredResults = applyScopeFilter(paged, scope);
        }
      }

      // Apply trust sort for non-academic results
      if (sort === "trust") {
        const trustOrder: Record<string, number> = {
          government: 0,
          major_journalism: 1,
          community: 2,
          other: 3,
        };
        scopeFilteredResults.sort(
          (a, b) =>
            (trustOrder[a.trustTier ?? "other"] ?? 3) -
            (trustOrder[b.trustTier ?? "other"] ?? 3)
        );
      } else if (sort === "year") {
        scopeFilteredResults.sort((a, b) => (b.year || 0) - (a.year || 0));
      }

      return NextResponse.json({
        results: scopeFilteredResults,
        total: visibleTotal,
        page,
        perPage,
        hasMore,
        sourceCounts: { [tabParam]: visibleTotal },
        searxngUnavailable: degraded,
      } satisfies SearchResponse);
    }

    const requestedDomainId = searchParams.get("domain");
    // Slice 1: default the domain (medicine). Per-user domain preferences arrive
    // with the domain-preferences table in a later slice.
    const domain = getDomainConfig(requestedDomainId ?? "medicine");

    // Step 1: Query augmentation (if enabled and query is long enough). Retained
    // for display (the "we searched for…" chips) and to hand the shared pipeline
    // an optimized PubMed query; the pipeline owns retrieval, fusion, and ranking.
    let augmentedQueries: SearchResponse["augmentedQueries"] | undefined;

    if (augment && q.length > 20) {
      try {
        const augmented = await augmentQuery(q, domain);
        augmentedQueries = {
          pubmed: augmented.pubmedQuery,
          semanticScholar: augmented.semanticScholarQuery,
          openAlex: augmented.openAlexQuery,
        };
      } catch {
        // Fall back to raw query if augmentation fails
      }
    }

    // Step 2: Delegate to the shared literature pipeline — the single source of
    // truth for academic search. It fans out to the owned MedCPT dense lane plus
    // PubMed and Europe PMC, RRF-fuses, cross-encoder reranks, enriches study
    // types / evidence / journal quality, and quality-ranks internally, then
    // applies the study-type and full-text filters. This replaces the route's
    // former manual fan-out to PubMed/S2/OpenAlex/ClinicalTrials/arXiv.
    const literature = await runLiteratureSearch({
      query: q,
      pubmedQuery: augmentedQueries?.pubmed,
      yearFrom: yearStart,
      yearTo: yearEnd,
      studyTypes,
      fullTextOnly: openAccessOnly,
      page,
      perPage,
    });

    let pool: UnifiedSearchResult[] = literature.results;
    let sourceCounts: Record<string, number> = literature.sourceCounts;
    let total = literature.total;

    // Dev-only safety net: when every live upstream is unreachable (local dev
    // without network), serve cached fixtures so the UI still renders results.
    if (pool.length === 0) {
      const fallback = await getDevelopmentFallbackResults(q, perPage);
      if (fallback) {
        pool = [
          ...fallback.pubmedResults,
          ...fallback.semanticScholarResults,
          ...fallback.openAlexResults,
          ...fallback.clinicalTrialsResults,
        ];
        sourceCounts = {
          pubmed: fallback.pubmedResults.length,
          semantic_scholar: fallback.semanticScholarResults.length,
          openalex: fallback.openAlexResults.length,
          clinical_trials: fallback.clinicalTrialsResults.length,
        };
        total = pool.length;
        log.info("Unified search served development fallback results", {
          query: q,
        });
      }
    }

    // Post-steps: the pipeline already filtered by study type / full text and
    // returned the requested page ranked by quality. The route only layers its
    // own concerns on top — trust tiers, scope constraints, and explicit sort.
    let results = pool.map(addTrustTier);

    // Scope constraints (custom included/excluded domains + keywords).
    if (scopeId && scopeId > 0) {
      const allScopes = await getUserScopes();
      const scope = allScopes.find((s) => s.id === scopeId);
      if (scope) {
        results = applyScopeFilter(results, scope);
      }
    }

    // Sort. "relevance" keeps the pipeline's quality-ranked order (default).
    if (sort === "citations") {
      results.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    } else if (sort === "year") {
      results.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sort === "evidence") {
      const levelOrder: Record<string, number> = {
        I: 1,
        II: 2,
        III: 3,
        IV: 4,
        V: 5,
      };
      results.sort(
        (a, b) =>
          (levelOrder[a.evidenceLevel || "V"] || 5) -
          (levelOrder[b.evidenceLevel || "V"] || 5)
      );
    } else if (sort === "impact") {
      results.sort(
        (a, b) => (b.journalImpactProxy ?? -1) - (a.journalImpactProxy ?? -1),
      );
    } else if (sort === "trust") {
      const trustOrder: Record<string, number> = {
        government: 0,
        major_journalism: 1,
        community: 2,
        other: 3,
      };
      results.sort(
        (a, b) =>
          (trustOrder[a.trustTier ?? "other"] ?? 3) -
          (trustOrder[b.trustTier ?? "other"] ?? 3)
      );
    }

    const hasMore = total > (page + 1) * perPage;

    const response: SearchResponse = {
      results,
      total,
      matchedTotal: literature.matchedTotal,
      page,
      perPage,
      hasMore,
      sourceCounts,
      sourceStatuses: literature.sourceStatuses,
      searxngUnavailable: false,
      augmentedQueries,
    };

    return NextResponse.json(response);
  } catch (error) {
    log.error("Unified search error", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
