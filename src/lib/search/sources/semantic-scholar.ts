import type { UnifiedSearchResult } from "@/types/search";
import { mapS2PublicationType, getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "SemanticScholar", failureThreshold: 5 });

interface S2SearchOptions {
  limit?: number;
  offset?: number;
  yearStart?: number;
  yearEnd?: number;
}

interface S2Paper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number;
  abstract: string | null;
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
  journal: { name: string } | null;
  tldr: { text: string } | null;
  externalIds: { DOI?: string; PubMed?: string } | null;
  url: string;
  publicationTypes: string[] | null;
  openAccessPdf: { url: string } | null;
  fieldsOfStudy: { category: string }[] | null;
  isOpenAccess: boolean;
}

interface S2SearchResponse {
  total: number;
  data: S2Paper[];
}

const S2_FIELDS = "title,authors,year,abstract,citationCount,journal,tldr,externalIds,url,publicationTypes,openAccessPdf,fieldsOfStudy,isOpenAccess,referenceCount,influentialCitationCount";

/**
 * Strip boolean operators and parentheses from a query so it works with
 * Semantic Scholar's plain-keyword search API. PubMed-style syntax like
 * `(diabetes OR insulin) AND treatment` becomes `diabetes insulin treatment`.
 * Also removes field tags like [MeSH], [tiab], etc.
 */
function sanitizeQueryForS2(query: string): string {
  return query
    .replace(/\[(?:MeSH|tiab|pt|au|ta|dp|mesh)[^\]]*\]/gi, "") // strip PubMed field tags
    .replace(/[()]/g, "")                                        // strip parentheses
    .replace(/\b(AND|OR|NOT)\b/g, " ")                           // strip boolean operators
    .replace(/"/g, "")                                            // strip quotes
    .replace(/\s+/g, " ")                                        // collapse whitespace
    .trim();
}

function mapPaper(paper: S2Paper): UnifiedSearchResult {
  const publicationTypes = paper.publicationTypes || [];
  let studyType = "other";
  for (const pt of publicationTypes) {
    const mapped = mapS2PublicationType(pt);
    if (mapped !== "other") {
      studyType = mapped;
      break;
    }
  }
  const evidence = getEvidenceLevel(studyType);

  return {
    title: paper.title || "",
    authors: paper.authors?.map((a) => a.name) || [],
    journal: paper.journal?.name || "",
    year: paper.year || 0,
    doi: paper.externalIds?.DOI || undefined,
    pmid: paper.externalIds?.PubMed || undefined,
    s2Id: paper.paperId,
    abstract: paper.abstract || undefined,
    tldr: paper.tldr?.text || undefined,
    citationCount: paper.citationCount || 0,
    influentialCitationCount: paper.influentialCitationCount || 0,
    referenceCount: paper.referenceCount || 0,
    publicationTypes,
    fieldsOfStudy: paper.fieldsOfStudy?.map((f) => f.category) || [],
    isOpenAccess: paper.isOpenAccess || false,
    openAccessPdfUrl: paper.openAccessPdf?.url || null,
    studyType,
    evidenceLevel: evidence.level,
    sources: ["semantic_scholar"],
  };
}

/**
 * Fetch a single paper by identifier using S2's direct lookup endpoint.
 * Accepts a Semantic Scholar ID, or DOI/PMID with the appropriate prefix.
 * E.g. "DOI:10.1234/...", "PMID:12345678", or a raw S2 paper ID.
 */
export async function getSemanticScholarPaper(
  identifier: string
): Promise<UnifiedSearchResult | null> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(identifier)}?fields=${S2_FIELDS}`;
  const headers: Record<string, string> = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  try {
    const res = await resilientFetch(url, { headers });
    const paper: S2Paper = await res.json();
    return mapPaper(paper);
  } catch {
    return null;
  }
}

export async function searchSemanticScholar(
  query: string,
  options: S2SearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    console.warn("[SemanticScholar] Circuit open — skipping");
    return {
      results: [],
      total: 0,
      status: {
        status: "error",
        message: "Circuit breaker open — recent Semantic Scholar failures",
      },
    };
  }

  const limit = options.limit || 20;
  const offset = options.offset || 0;
  const sanitizedQuery = sanitizeQueryForS2(query);

  let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(sanitizedQuery)}&limit=${limit}&offset=${offset}&fields=${S2_FIELDS}`;

  if (options.yearStart && options.yearEnd) {
    url += `&year=${options.yearStart}-${options.yearEnd}`;
  } else if (options.yearStart) {
    url += `&year=${options.yearStart}-`;
  } else if (options.yearEnd) {
    url += `&year=-${options.yearEnd}`;
  }

  const headers: Record<string, string> = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }

  try {
    const res = await resilientFetch(url, { headers }, { service: "SemanticScholar", timeout: 15000, baseDelay: 1000 });
    const data: S2SearchResponse = await res.json();

    const results = (data.data || []).map(mapPaper);
    breaker.onSuccess();
    return { results, total: data.total || 0, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[SemanticScholar] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, {
        hasApiKey: !!process.env.SEMANTIC_SCHOLAR_API_KEY,
      }),
    };
  }
}
