/**
 * Tavily web-search source — OPTIONAL fallback for recency, clinical-practice
 * guidelines / grey literature, and DOI/PMID repair. NEVER a primary source:
 * results are trust-tiered and carry low evidence so the clinical ranker keeps
 * stable primary literature (PubMed/OpenAlex/Crossref) on top.
 *
 * Requires TAVILY_API_KEY (read from env; never hardcoded). Fail-open: with no
 * key or on any error it returns an empty, "skipped" result.
 */

import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "Tavily", failureThreshold: 5 });

// Authoritative biomedical / guideline domains. Restricting the web search to
// these keeps low-trust SEO/marketing pages out of clinical results.
const TRUSTED_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "doi.org",
  "nih.gov",
  "who.int",
  "cdc.gov",
  "cochranelibrary.com",
  "nejm.org",
  "thelancet.com",
  "jamanetwork.com",
  "bmj.com",
  "ahajournals.org",
  "acc.org",
  "escardio.org",
  "kidney-international.org",
  "kdigo.org",
  "uspreventiveservicestaskforce.org",
  "nice.org.uk",
];

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/;

export function extractDoi(text: string): string | undefined {
  const m = text.match(DOI_RE);
  return m ? m[0].replace(/[).,;]+$/, "").toLowerCase() : undefined;
}

export function extractPmid(url: string): string | undefined {
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  return m ? m[1] : undefined;
}

export function trustTierForUrl(
  url: string
): NonNullable<UnifiedSearchResult["trustTier"]> {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (/\.gov$|\.gov\/|nih\.gov|who\.int|cdc\.gov|nice\.org\.uk|kdigo\.org/.test(host)) {
    return "government";
  }
  if (
    /nejm\.org|thelancet\.com|jamanetwork\.com|bmj\.com|ahajournals\.org|acc\.org|escardio\.org|cochranelibrary\.com/.test(
      host
    )
  ) {
    return "major_journalism";
  }
  return "other";
}

function yearOf(date?: string): number {
  if (!date) return 0;
  const m = date.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function toUnified(r: TavilyResult): UnifiedSearchResult {
  const doi = extractDoi(r.url) ?? extractDoi(r.content);
  const pmid = extractPmid(r.url);
  return {
    title: r.title,
    authors: [],
    journal: "",
    year: yearOf(r.published_date),
    url: r.url,
    doi,
    pmid,
    abstract: r.content,
    citationCount: 0,
    publicationTypes: [],
    studyType: "other",
    evidenceLevel: "V",
    isOpenAccess: true,
    sources: ["web"],
    trustTier: trustTierForUrl(r.url),
    flags: ["web_source"],
  };
}

export async function searchTavily(
  query: string,
  options: { maxResults?: number; topic?: "general" | "news"; restrictDomains?: boolean } = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      results: [],
      total: 0,
      status: { status: "missing_config", message: "TAVILY_API_KEY not set — web fallback disabled" },
    };
  }
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Tavily failures" },
    };
  }
  try {
    const res = await resilientFetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: options.maxResults ?? 5,
          topic: options.topic ?? "general",
          include_domains: options.restrictDomains === false ? undefined : TRUSTED_DOMAINS,
        }),
      },
      { service: "Tavily", timeout: 10000, maxRetries: 1 }
    );
    const data: { results?: TavilyResult[] } = await res.json();
    breaker.onSuccess();
    const results = (data.results ?? []).filter((r) => r.title && r.url).map(toUnified);
    return { results, total: results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
