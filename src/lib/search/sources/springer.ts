/**
 * Springer Nature source lane — OPTIONAL, ENV-GATED.
 *
 * Activates only when SPRINGER_API_KEY is present. With no key configured it is
 * inert: it returns an empty, "missing_config" outcome and never throws, so it
 * can sit in the fan-out without affecting behaviour until a key is wired in.
 *
 * Request contract (verified against the Springer Nature Developer Portal —
 * https://dev.springernature.com/docs/api-endpoints/meta-api/):
 *   GET https://api.springernature.com/meta/v2/json?q=<q>&p=<n>&s=<start>&api_key=<key>
 *   `p` = page size, `s` = 1-based start index.
 *
 * Response: top-level `records[]` (plus a `result[]` summary with `total`). Each
 * record carries `title`, `creators[].creator` ("Last, First"), `publicationName`,
 * `publicationDate` (YYYY-MM-DD), `doi`, `abstract`, `openaccess` ("true"/"false"),
 * and `url[]` ({ platform, format, value }) — filtered here for the web PDF link.
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

const breaker = createCircuitBreaker({ service: "Springer", failureThreshold: 5 });

/** Springer Meta caps the page size (`p`) at 100; default is 10. */
const MAX_PAGE_SIZE = 100;

/** Read the Springer key from env. */
export function getSpringerApiKey(): string | undefined {
  return process.env.SPRINGER_API_KEY || undefined;
}

interface SpringerSearchOptions {
  limit?: number;
  /** 1-based start index (Springer's `s` param). */
  start?: number;
  yearStart?: number;
  yearEnd?: number;
}

interface SpringerCreator {
  creator?: string;
}

interface SpringerUrl {
  platform?: string;
  format?: string;
  value?: string;
}

export interface SpringerRecord {
  title?: string;
  creators?: SpringerCreator[];
  publicationName?: string;
  publicationDate?: string;
  doi?: string;
  abstract?: string;
  /** "true" | "false" — Springer serialises the open-access flag as a string. */
  openaccess?: string;
  url?: SpringerUrl[];
  contentType?: string;
}

interface SpringerResultSummary {
  total?: string;
}

interface SpringerResponse {
  result?: SpringerResultSummary[];
  records?: SpringerRecord[];
}

/**
 * Convert Springer's "Last, First" creator strings into natural "First Last"
 * display order. Names without a comma are passed through untouched.
 */
export function extractSpringerAuthors(record: SpringerRecord): string[] {
  return (record.creators ?? [])
    .map((c) => c.creator?.trim())
    .filter((n): n is string => Boolean(n))
    .map((name) => {
      const comma = name.indexOf(",");
      if (comma === -1) return name;
      const family = name.slice(0, comma).trim();
      const given = name.slice(comma + 1).trim();
      return given ? `${given} ${family}` : family;
    });
}

/**
 * Pick the best web link: prefer the PDF, then any HTML web link. Returns null
 * when no `platform: "web"` link is present.
 */
export function extractSpringerPdfUrl(record: SpringerRecord): string | null {
  const urls = (record.url ?? []).filter((u) => u.platform === "web" && u.value);
  const pdf = urls.find((u) => u.format === "pdf");
  if (pdf?.value) return pdf.value.replace(/^http:/, "https:");
  const html = urls.find((u) => u.format === "html") ?? urls[0];
  return html?.value ? html.value.replace(/^http:/, "https:") : null;
}

function yearFromPublicationDate(date?: string): number {
  if (!date) return 0;
  const m = date.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Map one Springer record to a UnifiedSearchResult. Returns null when untitled. */
export function mapSpringerRecord(record: SpringerRecord): UnifiedSearchResult | null {
  const title = record.title?.trim();
  if (!title) return null;

  const evidence = getEvidenceLevel("other");
  const isOpenAccess = record.openaccess === "true";

  return {
    title,
    authors: extractSpringerAuthors(record),
    journal: record.publicationName?.trim() ?? "",
    year: yearFromPublicationDate(record.publicationDate),
    doi: record.doi || undefined,
    abstract: record.abstract?.trim() || undefined,
    citationCount: 0,
    publicationTypes: [],
    studyType: "other",
    evidenceLevel: evidence.level,
    isOpenAccess,
    openAccessPdfUrl: isOpenAccess ? extractSpringerPdfUrl(record) : null,
    sources: ["springer"],
  };
}

export async function searchSpringer(
  query: string,
  opts: SpringerSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  const apiKey = getSpringerApiKey();
  if (!apiKey) {
    return {
      results: [],
      total: 0,
      status: {
        status: "missing_config",
        message: "SPRINGER_API_KEY not set — Springer source disabled",
      },
    };
  }

  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Springer failures" },
    };
  }

  const pageSize = Math.min(opts.limit || 20, MAX_PAGE_SIZE);
  const start = opts.start ?? 1;

  let searchQuery = query;
  if (opts.yearStart || opts.yearEnd) {
    const startYear = opts.yearStart || 1900;
    const endYear = opts.yearEnd || new Date().getFullYear();
    // Springer's constraint syntax: onlinedatefrom / onlinedateto (YYYY-MM-DD).
    searchQuery += ` onlinedatefrom:${startYear}-01-01 onlinedateto:${endYear}-12-31`;
  }

  const url =
    `https://api.springernature.com/meta/v2/json` +
    `?q=${encodeURIComponent(searchQuery)}` +
    `&p=${pageSize}&s=${start}&api_key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await resilientFetch(
      url,
      { headers: { Accept: "application/json" } },
      { service: "Springer", timeout: 8000, maxRetries: 1 }
    );
    const data: SpringerResponse = await res.json();

    const rawRecords = data.records ?? [];
    const results: UnifiedSearchResult[] = [];
    for (const record of rawRecords) {
      const mapped = mapSpringerRecord(record);
      if (mapped) results.push(mapped);
    }

    const total = Number(data.result?.[0]?.total) || results.length;

    breaker.onSuccess();
    return { results, total, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[Springer] Search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error, { hasApiKey: true }) };
  }
}
