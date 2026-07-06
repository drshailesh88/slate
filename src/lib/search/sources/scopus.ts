/**
 * Elsevier / Scopus source lane — OPTIONAL, ENV-GATED.
 *
 * Activates only when ELSEVIER_API_KEY (or SCOPUS_API_KEY) is present. With no
 * key configured it is inert: it returns an empty, "missing_config" outcome and
 * never throws, so it can sit in the fan-out without affecting behaviour until a
 * key is wired in.
 *
 * Request contract (verified against the Elsevier Developer Portal —
 * https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl):
 *   GET https://api.elsevier.com/content/search/scopus?query=<q>&count=<n>
 *   Auth: `X-ELS-APIKey` header (preferred — keeps the key out of URLs/logs) or
 *   an `apiKey` query param. COMPLETE view surfaces abstract + full author list.
 *
 * Response: `search-results.entry[]`, each entry carrying `dc:title`,
 * `dc:creator` (first author), `author[]` (COMPLETE view), `prism:publicationName`,
 * `prism:coverDate`, `prism:doi`, `citedby-count`, `dc:description` (abstract).
 * A zero-result query returns a single entry with an `error` field.
 */

import type { UnifiedSearchResult } from "@/types/search";
import { getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "Scopus", failureThreshold: 5 });

/** Scopus caps `count` at 25 per request for the search endpoint. */
const MAX_COUNT = 25;

/** Read the Scopus key from env, accepting either accepted variable name. */
export function getScopusApiKey(): string | undefined {
  return process.env.ELSEVIER_API_KEY || process.env.SCOPUS_API_KEY || undefined;
}

interface ScopusSearchOptions {
  limit?: number;
  start?: number;
  yearStart?: number;
  yearEnd?: number;
  view?: "STANDARD" | "COMPLETE";
}

interface ScopusAuthor {
  authname?: string;
  surname?: string;
  "given-name"?: string;
  "ce:indexed-name"?: string;
}

export interface ScopusEntry {
  "dc:title"?: string;
  "dc:creator"?: string;
  "dc:description"?: string;
  "dc:identifier"?: string;
  "prism:publicationName"?: string;
  "prism:coverDate"?: string;
  "prism:doi"?: string;
  "prism:url"?: string;
  "citedby-count"?: string;
  openaccess?: string;
  openaccessFlag?: boolean;
  author?: ScopusAuthor[];
  /** Present (in place of real fields) when a query returns zero results. */
  error?: string;
}

interface ScopusResponse {
  "search-results"?: {
    "opensearch:totalResults"?: string;
    entry?: ScopusEntry[];
  };
}

/**
 * Extract author display names, preferring the COMPLETE-view `author[]` list
 * (`authname`, then `ce:indexed-name`) and falling back to the STANDARD-view
 * `dc:creator` (first author only) when the full list is absent.
 */
export function extractScopusAuthors(entry: ScopusEntry): string[] {
  const list = entry.author;
  if (Array.isArray(list) && list.length > 0) {
    const names = list
      .map((a) => a.authname?.trim() || a["ce:indexed-name"]?.trim())
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) return names;
  }
  const creator = entry["dc:creator"]?.trim();
  return creator ? [creator] : [];
}

function yearFromCoverDate(date?: string): number {
  if (!date) return 0;
  const m = date.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Map one Scopus entry to a UnifiedSearchResult. Returns null when untitled. */
export function mapScopusEntry(entry: ScopusEntry): UnifiedSearchResult | null {
  const title = entry["dc:title"]?.trim();
  if (!title) return null;

  const evidence = getEvidenceLevel("other");

  return {
    title,
    authors: extractScopusAuthors(entry),
    journal: entry["prism:publicationName"]?.trim() ?? "",
    year: yearFromCoverDate(entry["prism:coverDate"]),
    doi: entry["prism:doi"] || undefined,
    abstract: entry["dc:description"]?.trim() || undefined,
    citationCount: Number(entry["citedby-count"]) || 0,
    publicationTypes: [],
    studyType: "other",
    evidenceLevel: evidence.level,
    isOpenAccess: entry.openaccessFlag === true || entry.openaccess === "1",
    sources: ["scopus"],
  };
}

export async function searchScopus(
  query: string,
  opts: ScopusSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const apiKey = getScopusApiKey();
  if (!apiKey) {
    return {
      results: [],
      total: 0,
      status: {
        status: "missing_config",
        message: "ELSEVIER_API_KEY (or SCOPUS_API_KEY) not set — Scopus source disabled",
      },
    };
  }

  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Scopus failures" },
    };
  }

  const count = Math.min(opts.limit || 20, MAX_COUNT);
  const start = opts.start ?? 0;
  // STANDARD is the entitlement a plain API key carries; COMPLETE needs an
  // institutional subscription token (X-ELS-Insttoken) and 401s without it.
  const view = opts.view ?? "STANDARD";

  // Field-scope the query to title/abstract/keywords — a bare term string searches
  // everything (affiliations, refs) and dilutes relevance; TITLE-ABS-KEY is the
  // standard relevance search and is what a plain key is entitled to run.
  let searchQuery = `TITLE-ABS-KEY(${query})`;
  if (opts.yearStart || opts.yearEnd) {
    const startYear = opts.yearStart || 1900;
    const endYear = opts.yearEnd || new Date().getFullYear();
    // Scopus range syntax is exclusive at both ends: AFT <start-1>, BEF <end+1>.
    searchQuery += ` AND PUBYEAR AFT ${startYear - 1} AND PUBYEAR BEF ${endYear + 1}`;
  }

  const url =
    `https://api.elsevier.com/content/search/scopus` +
    `?query=${encodeURIComponent(searchQuery)}` +
    `&count=${count}&start=${start}&view=${view}`;

  try {
    const res = await resilientFetch(
      url,
      { headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" } },
      { service: "Scopus", timeout: 8000, maxRetries: 1 }
    );
    const data: ScopusResponse = await res.json();

    // A zero-result query returns a single synthetic entry carrying `error`.
    const rawEntries = (data["search-results"]?.entry ?? []).filter((e) => !e.error);
    const results: UnifiedSearchResult[] = [];
    for (const entry of rawEntries) {
      const mapped = mapScopusEntry(entry);
      if (mapped) results.push(mapped);
    }

    const total =
      Number(data["search-results"]?.["opensearch:totalResults"]) || results.length;

    breaker.onSuccess();
    return { results, total, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[Scopus] Search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error, { hasApiKey: true }) };
  }
}
