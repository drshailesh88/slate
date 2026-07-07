import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";

const breaker = createCircuitBreaker({ service: "arXiv", failureThreshold: 5 });

interface ArxivSearchOptions {
  maxResults?: number;
  start?: number;
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
  categories?: string[];
  yearStart?: number;
  yearEnd?: number;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractEntries(xml: string): string[] {
  return xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
}

function parseEntry(entry: string): UnifiedSearchResult | null {
  // Title
  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? collapseWhitespace(titleMatch[1]) : "";
  if (!title) return null;

  // Abstract
  const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
  const abstract = summaryMatch ? collapseWhitespace(summaryMatch[1]) : undefined;

  // Authors
  const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)];
  const authors = authorMatches.map((m) => collapseWhitespace(m[1]));

  // arXiv ID from <id> element — strip URL prefix
  const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
  const rawId = idMatch ? collapseWhitespace(idMatch[1]) : "";
  const arxivId = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//, "");

  // Published year
  const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
  const publishedStr = publishedMatch ? collapseWhitespace(publishedMatch[1]) : "";
  const yearMatch = publishedStr.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

  // DOI — prefer the published journal DOI; otherwise fall back to arXiv's canonical
  // DOI (10.48550/arXiv.<id>, version stripped) so dedup + must-have matching work for
  // preprints that were never formally published.
  const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
  const cleanArxivId = arxivId.replace(/v\d+$/, "");
  const doi = doiMatch
    ? collapseWhitespace(doiMatch[1])
    : cleanArxivId
      ? `10.48550/arXiv.${cleanArxivId}`
      : undefined;

  // Primary category for journal field
  const primaryCatMatch = entry.match(/<arxiv:primary_category[^>]*term="([^"]*)"/)
  const primaryCategory = primaryCatMatch ? primaryCatMatch[1] : undefined;
  const journal = primaryCategory ? `arXiv:${primaryCategory}` : "arXiv";

  // All categories as fields of study
  const categoryMatches = [...entry.matchAll(/<category\s+term="([^"]*)"/g)];
  const fieldsOfStudy = categoryMatches.map((m) => m[1]);

  // PDF link
  const pdfMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*title="pdf"/)
    || entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]*)"/);
  const openAccessPdfUrl = pdfMatch ? pdfMatch[1] : undefined;

  return {
    title,
    authors,
    journal,
    year,
    doi,
    arxivId,
    abstract,
    citationCount: 0,
    isOpenAccess: true,
    openAccessPdfUrl: openAccessPdfUrl || null,
    publicationTypes: ["preprint"],
    fieldsOfStudy,
    studyType: "preprint",
    sources: ["arxiv"],
  };
}

export async function searchArxiv(
  query: string,
  options: ArxivSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number }> {
  if (!breaker.canRequest()) {
    console.warn("[arXiv] Circuit open — skipping");
    return { results: [], total: 0 };
  }

  const maxResults = Math.min(options.maxResults || 20, 100);
  const start = options.start || 0;
  const sortBy = options.sortBy || "relevance";

  // Build search query
  let searchQuery: string;
  if (options.categories && options.categories.length > 0) {
    const catFilter = options.categories.map((c) => `cat:${c}`).join("+OR+");
    searchQuery = `(all:${encodeURIComponent(query)})+AND+(${catFilter})`;
  } else {
    searchQuery = `all:${encodeURIComponent(query)}`;
  }

  // HTTPS is required: arXiv now 301-redirects http:// to https:// and returns an
  // empty body on the redirect, which silently broke this lane.
  const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=${start}&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=descending`;

  try {
    const res = await resilientFetch(url, {}, { service: "arXiv", timeout: 15000, baseDelay: 3000 });
    const xml = await res.text();

    // Total results
    const totalMatch = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    // Parse entries
    const entries = extractEntries(xml);
    let results: UnifiedSearchResult[] = [];
    for (const entry of entries) {
      const parsed = parseEntry(entry);
      if (parsed) results.push(parsed);
    }

    // Year filtering (post-parse, since arXiv API doesn't support it natively)
    const { yearStart, yearEnd } = options;
    if (yearStart || yearEnd) {
      results = results.filter((r) => {
        if (yearStart && r.year < yearStart) return false;
        if (yearEnd && r.year > yearEnd) return false;
        return true;
      });
    }

    breaker.onSuccess();
    return { results, total };
  } catch (error) {
    breaker.onFailure();
    console.error("[arXiv] Search failed:", error);
    return { results: [], total: 0 };
  }
}
