/**
 * Crossref source — authoritative DOI metadata + bibliographic resolution.
 *
 * Used for:
 *  - `fetch_paper` by DOI (S2-independent resolver).
 *  - Metadata repair: filling journal/year/authors/title and citation counts
 *    (`is-referenced-by-count`) on results that have a DOI but missing fields.
 *  - DOI resolution from a free-text/bibliographic reference.
 *
 * Free, keyless (polite pool via mailto). Never required — fail-open everywhere.
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

const breaker = createCircuitBreaker({ service: "Crossref", failureThreshold: 5 });
const MAILTO = "contact@scholarsync.com";

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "container-title"?: string[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  type?: string;
  subtype?: string;
  "is-referenced-by-count"?: number;
  abstract?: string;
  subject?: string[];
  update?: { type?: string }[];
  "update-to"?: { type?: string }[];
  relation?: Record<string, unknown>;
}

function authorName(a: CrossrefAuthor): string {
  if (a.name) return a.name;
  const family = a.family ?? "";
  const given = a.given ?? "";
  return `${family}${given ? ` ${given}` : ""}`.trim();
}

function yearOf(work: CrossrefWork): number {
  const src =
    work.issued?.["date-parts"]?.[0] ??
    work["published-print"]?.["date-parts"]?.[0] ??
    work["published-online"]?.["date-parts"]?.[0] ??
    work.published?.["date-parts"]?.[0];
  return src?.[0] ?? 0;
}

/**
 * Map a Crossref "type" to our study-type buckets. Crossref types are coarse
 * (mostly "journal-article"), so this only sets clear ones; the study-type
 * detector refines the rest from title/abstract downstream.
 */
function mapCrossrefType(type?: string): string {
  switch (type) {
    case "journal-article":
      return "other";
    case "proceedings-article":
      return "other";
    default:
      return "other";
  }
}

/** True if Crossref signals this DOI has been retracted (best-effort). */
export function isRetractedByCrossref(work: CrossrefWork): boolean {
  const updates = [...(work.update ?? []), ...(work["update-to"] ?? [])];
  if (updates.some((u) => /retract/i.test(u.type ?? ""))) return true;
  const rel = work.relation ?? {};
  return Boolean(rel["is-retracted-by"]);
}

function toUnified(work: CrossrefWork): UnifiedSearchResult {
  const studyType = mapCrossrefType(work.type);
  const evidence = getEvidenceLevel(studyType);
  const pubTypes = work.type ? [work.type] : [];
  // Crossref abstracts are JATS XML — strip tags for a plain snippet.
  const abstract = work.abstract
    ? work.abstract.replace(/<[^>]*>/g, "").trim()
    : undefined;

  return {
    title: work.title?.[0] ?? "",
    authors: (work.author ?? []).map(authorName).filter(Boolean),
    journal: work["container-title"]?.[0] ?? "",
    year: yearOf(work),
    doi: work.DOI?.toLowerCase(),
    abstract,
    citationCount: work["is-referenced-by-count"] ?? 0,
    publicationTypes: pubTypes,
    concepts: work.subject,
    studyType,
    evidenceLevel: evidence.level,
    isOpenAccess: false,
    sources: ["crossref"],
    flags: isRetractedByCrossref(work) ? ["retracted"] : undefined,
  };
}

/** Fetch a single work's metadata by DOI. Returns null if not found. */
export async function fetchCrossrefByDoi(
  doi: string
): Promise<UnifiedSearchResult | null> {
  if (!breaker.canRequest()) return null;
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  const url = `https://api.crossref.org/works/${encodeURIComponent(clean)}?mailto=${MAILTO}`;
  try {
    const res = await resilientFetch(url, {}, { service: "Crossref", timeout: 8000 });
    const data: { message?: CrossrefWork } = await res.json();
    breaker.onSuccess();
    if (!data.message?.DOI) return null;
    return toUnified(data.message);
  } catch {
    breaker.onFailure();
    return null;
  }
}

/**
 * Resolve a DOI (and basic metadata) from a free-text bibliographic reference —
 * used to repair results that arrived without a DOI. Returns the best match or null.
 */
export async function resolveDoiByBibliographic(
  reference: string
): Promise<UnifiedSearchResult | null> {
  if (!breaker.canRequest() || !reference.trim()) return null;
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
    reference
  )}&rows=1&select=DOI,title,container-title,author,issued,type,is-referenced-by-count&mailto=${MAILTO}`;
  try {
    const res = await resilientFetch(url, {}, { service: "Crossref", timeout: 8000 });
    const data: { message?: { items?: CrossrefWork[] } } = await res.json();
    breaker.onSuccess();
    const item = data.message?.items?.[0];
    return item?.DOI ? toUnified(item) : null;
  } catch {
    breaker.onFailure();
    return null;
  }
}

/** Search Crossref for general queries (used as an optional supplementary source). */
export async function searchCrossref(
  query: string,
  options: { limit?: number } = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent Crossref failures" },
    };
  }
  const rows = options.limit ?? 20;
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(
    query
  )}&rows=${rows}&select=DOI,title,container-title,author,issued,type,is-referenced-by-count,abstract,subject&mailto=${MAILTO}`;
  try {
    const res = await resilientFetch(url, {}, { service: "Crossref", timeout: 12000 });
    const data: { message?: { items?: CrossrefWork[]; "total-results"?: number } } =
      await res.json();
    breaker.onSuccess();
    const items = data.message?.items ?? [];
    return {
      results: items.filter((w) => w.title?.length).map(toUnified),
      total: data.message?.["total-results"] ?? items.length,
      status: okStatus(),
    };
  } catch (error) {
    breaker.onFailure();
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
