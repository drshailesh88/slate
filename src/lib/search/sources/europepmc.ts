import type { UnifiedSearchResult } from "@/types/search";
import { mapPubMedPublicationType, getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "EuropePMC", failureThreshold: 5 });

/** Europe PMC caps pageSize at 100. */
const MAX_PAGE_SIZE = 100;

interface EuropePMCSearchOptions {
  limit?: number;
  page?: number;
  yearStart?: number;
  yearEnd?: number;
}

interface EuropePMCFullTextUrl {
  url?: string;
  documentStyle?: string;
  availability?: string;
}

interface EuropePMCResult {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  authorList?: { author?: { fullName?: string }[] };
  journalInfo?: {
    journal?: { title?: string };
    yearOfPublication?: number;
  };
  pubYear?: string;
  citedByCount?: number;
  isOpenAccess?: string;
  pubTypeList?: { pubType?: string[] };
  fullTextUrlList?: { fullTextUrl?: EuropePMCFullTextUrl[] };
}

interface EuropePMCResponse {
  hitCount?: number;
  resultList?: { result?: EuropePMCResult[] };
}

/**
 * Split Europe PMC's `authorString` ("Smith AB, Jones CD.") into individual
 * author names, stripping the trailing sentence period and empty fragments.
 * Falls back to `authorList.author[].fullName` when the flat string is absent.
 */
function extractAuthors(result: EuropePMCResult): string[] {
  if (result.authorString) {
    return result.authorString
      .split(",")
      .map((a) => a.trim().replace(/\.$/, "").trim())
      .filter(Boolean);
  }
  const fromList = result.authorList?.author
    ?.map((a) => a.fullName?.trim())
    .filter((n): n is string => Boolean(n));
  return fromList ?? [];
}

/**
 * Pick the best open-access PDF link: prefer an "Open access" PDF, then any
 * open-access link, then any PDF link. Returns null when none qualify.
 */
function extractOpenAccessPdfUrl(result: EuropePMCResult): string | null {
  const urls = result.fullTextUrlList?.fullTextUrl ?? [];
  const openPdf = urls.find(
    (u) => u.availability === "Open access" && u.documentStyle === "pdf" && u.url
  );
  if (openPdf?.url) return openPdf.url;
  const open = urls.find((u) => u.availability === "Open access" && u.url);
  if (open?.url) return open.url;
  const pdf = urls.find((u) => u.documentStyle === "pdf" && u.url);
  return pdf?.url ?? null;
}

function mapResult(result: EuropePMCResult): UnifiedSearchResult | null {
  const title = result.title?.trim();
  if (!title) return null;

  const publicationTypes = result.pubTypeList?.pubType ?? [];
  let studyType = "other";
  for (const pt of publicationTypes) {
    const mapped = mapPubMedPublicationType(pt);
    if (mapped !== "other") {
      studyType = mapped;
      break;
    }
  }
  const evidence = getEvidenceLevel(studyType);

  const year =
    Number(result.pubYear) || result.journalInfo?.yearOfPublication || 0;

  return {
    title,
    authors: extractAuthors(result),
    journal: result.journalInfo?.journal?.title ?? "",
    year,
    doi: result.doi || undefined,
    // Only MEDLINE-sourced records carry a genuine PubMed PMID; other Europe PMC
    // sources (PMC, PPR preprints, patents) reuse `id`/`pmid` for their own ids.
    pmid: result.source === "MED" ? result.pmid || undefined : undefined,
    abstract: result.abstractText || undefined,
    citationCount: result.citedByCount || 0,
    publicationTypes,
    studyType,
    evidenceLevel: evidence.level,
    isOpenAccess: result.isOpenAccess === "Y",
    openAccessPdfUrl: extractOpenAccessPdfUrl(result),
    sources: ["europepmc"],
  };
}

export async function searchEuropePMC(
  query: string,
  opts: EuropePMCSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    console.warn("[EuropePMC] Circuit open — skipping");
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent EuropePMC failures" },
    };
  }

  const limit = Math.min(opts.limit || 20, MAX_PAGE_SIZE);
  const page = opts.page || 1;

  let searchQuery = query;
  if (opts.yearStart || opts.yearEnd) {
    const start = opts.yearStart || 1900;
    const end = opts.yearEnd || new Date().getFullYear();
    searchQuery += ` AND (PUB_YEAR:[${start} TO ${end}])`;
  }

  const url =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search` +
    `?query=${encodeURIComponent(searchQuery)}` +
    `&format=json&resultType=core&pageSize=${limit}&page=${page}`;

  try {
    const res = await resilientFetch(url, {}, { service: "EuropePMC", timeout: 6000, maxRetries: 1 });
    const data: EuropePMCResponse = await res.json();

    const rawResults = data.resultList?.result ?? [];
    const results: UnifiedSearchResult[] = [];
    for (const raw of rawResults) {
      const mapped = mapResult(raw);
      if (mapped) results.push(mapped);
    }

    breaker.onSuccess();
    return { results, total: data.hitCount || 0, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[EuropePMC] Search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
