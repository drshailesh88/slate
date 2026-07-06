import type { UnifiedSearchResult } from "@/types/search";
import { mapPubMedPublicationType, getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import { createKeyRotator } from "@/lib/search/api-key-rotator";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "PubMed", failureThreshold: 5 });

// Initialize key rotator: prefer PUBMED_API_KEYS (comma-separated), fall back to PUBMED_API_KEY (singular)
const pubmedKeys: string[] =
  process.env.PUBMED_API_KEYS?.split(",") ??
  (process.env.PUBMED_API_KEY ? [process.env.PUBMED_API_KEY] : []);
const keyRotator = createKeyRotator(pubmedKeys);

// Outbound rate limiter — NCBI E-utilities allow ~10 req/s with an API key, ~3
// without. Pacing prevents the self-inflicted 429s that otherwise pin the source
// and trip the circuit breaker (cascade-to-empty).
const pubmedLimiter = createOutboundLimiter({
  service: "PubMed",
  requestsPerSecond: pubmedKeys.length > 0 ? 9 : 2.5,
  burst: pubmedKeys.length > 0 ? 3 : 2,
});

/** Append the next rotated API key to a PubMed URL, or return the URL unchanged if no keys. */
function appendApiKey(url: string): string {
  const key = keyRotator.next();
  if (!key) return url;
  return `${url}&api_key=${encodeURIComponent(key)}`;
}

interface PubMedSearchOptions {
  maxResults?: number;
  page?: number;
  yearStart?: number;
  yearEnd?: number;
  /**
   * Result ordering. "relevance" = PubMed Best Match (semantic-ish ranking that
   * surfaces landmark papers); "date" / undefined = MEDLINE default (most recent
   * first). Defaults to "relevance" — recency is the wrong default for clinical
   * literature search (it buries landmark older RCTs).
   */
  sort?: "relevance" | "date";
}

interface PubMedESearchResult {
  esearchresult: {
    idlist: string[];
    count: string;
  };
}

function stripXmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function parseArticle(article: string): UnifiedSearchResult | null {
  // Title
  const titleMatch = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
  const title = titleMatch ? stripXmlTags(titleMatch[1]) : "";
  if (!title) return null;

  // Abstract (handle structured abstracts)
  const abstractTexts = [
    ...article.matchAll(
      /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g
    ),
  ];
  const abstract = abstractTexts
    .map((m) =>
      m[1]
        ? `${m[1]}: ${stripXmlTags(m[2])}`
        : stripXmlTags(m[2])
    )
    .join(" ");

  // Authors — extract each <Author> block first, then pull names from within
  // it. A single combined regex with nested `[\s\S]*?` quantifiers and an
  // optional ForeName group backtracks catastrophically on large article XML
  // (modern articles with long author/reference lists can block the event loop
  // for tens of seconds). Per-block parsing keeps this linear.
  const authorBlocks = article.match(/<Author\b[^>]*>[\s\S]*?<\/Author>/g) || [];
  const authors = authorBlocks
    .map((block) => {
      const lastMatch = block.match(/<LastName>([\s\S]*?)<\/LastName>/);
      if (!lastMatch) return "";
      const foreMatch = block.match(/<ForeName>([\s\S]*?)<\/ForeName>/);
      const lastName = stripXmlTags(lastMatch[1]);
      const foreName = foreMatch ? stripXmlTags(foreMatch[1]) : "";
      return foreName ? `${lastName} ${foreName}` : lastName;
    })
    .filter(Boolean);

  // Journal
  const journalMatch =
    article.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/) ||
    article.match(/<Title>([\s\S]*?)<\/Title>/);
  const journal = journalMatch ? stripXmlTags(journalMatch[1]) : "";

  // Year
  const yearMatch =
    article.match(/<PubDate>[\s\S]*?<Year>([\s\S]*?)<\/Year>/) ||
    article.match(/<PubDate>[\s\S]*?<MedlineDate>([\s\S]*?)<\/MedlineDate>/);
  const yearStr = yearMatch ? stripXmlTags(yearMatch[1]) : "";
  const yearNumMatch = yearStr.match(/(\d{4})/);
  const year = yearNumMatch ? parseInt(yearNumMatch[1], 10) : 0;

  // DOI
  const doiMatch = article.match(
    /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/
  );
  const doi = doiMatch ? stripXmlTags(doiMatch[1]) : undefined;

  // PMID
  const pmidMatch = article.match(
    /<PMID[^>]*>([\s\S]*?)<\/PMID>/
  );
  const pmid = pmidMatch ? stripXmlTags(pmidMatch[1]) : "";

  // Publication types
  const pubTypeMatches = [
    ...article.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g),
  ];
  const publicationTypes = pubTypeMatches.map((m) => stripXmlTags(m[1]));

  // MeSH terms
  const meshMatches = [
    ...article.matchAll(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g),
  ];
  const meshTerms = meshMatches.map((m) => stripXmlTags(m[1]));

  // Derive study type from publication types
  let studyType = "other";
  for (const pt of publicationTypes) {
    const mapped = mapPubMedPublicationType(pt);
    if (mapped !== "other") {
      studyType = mapped;
      break;
    }
  }

  const evidence = getEvidenceLevel(studyType);

  return {
    title,
    authors,
    journal,
    year,
    doi,
    pmid,
    abstract: abstract || undefined,
    citationCount: 0,
    publicationTypes,
    meshTerms,
    studyType,
    evidenceLevel: evidence.level,
    isOpenAccess: false,
    sources: ["pubmed"],
  };
}

export async function searchPubMed(
  query: string,
  options: PubMedSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    console.warn("[PubMed] Circuit open — skipping");
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent PubMed failures" },
    };
  }

  const maxResults = options.maxResults || 20;
  const page = options.page || 0;
  const retstart = page * maxResults;

  // Build search URL. Default to PubMed Best Match ("relevance") so landmark
  // papers surface — MEDLINE's implicit most-recent-first sort buries them.
  const sort = options.sort ?? "relevance";
  let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retstart=${retstart}&retmode=json&tool=scholarsync&email=contact@scholarsync.com`;

  if (sort === "relevance") {
    searchUrl += "&sort=relevance";
  }

  if (options.yearStart || options.yearEnd) {
    const minDate = options.yearStart || 1900;
    const maxDate = options.yearEnd || new Date().getFullYear();
    searchUrl += `&mindate=${minDate}&maxdate=${maxDate}&datetype=pdat`;
  }

  try {
    // Step 1: ESearch for PMIDs (with key rotation + resilient fetch)
    await pubmedLimiter.acquire();
    const searchRes = await resilientFetch(appendApiKey(searchUrl), {}, { service: "PubMed", timeout: 15000, baseDelay: 400, maxRetries: 2 });
    const searchData: PubMedESearchResult = await searchRes.json();
    const pmids = searchData.esearchresult.idlist;
    const total = parseInt(searchData.esearchresult.count, 10);

    if (pmids.length === 0) {
      breaker.onSuccess();
      return { results: [], total: 0, status: okStatus() };
    }

    // Step 2: EFetch for full XML (with key rotation + resilient fetch)
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=xml&retmode=xml&tool=scholarsync&email=contact@scholarsync.com`;
    await pubmedLimiter.acquire();
    const fetchRes = await resilientFetch(appendApiKey(fetchUrl), {}, { service: "PubMed", timeout: 15000, baseDelay: 400, maxRetries: 2 });
    const xml = await fetchRes.text();

    // Parse individual articles
    const articleChunks =
      xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    const results: UnifiedSearchResult[] = [];
    for (const chunk of articleChunks) {
      const parsed = parseArticle(chunk);
      if (parsed) results.push(parsed);
    }

    breaker.onSuccess();
    return { results, total, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[PubMed] Search failed:", error);
    return {
      results: [],
      total: 0,
      status: classifyFetchError(error, { hasApiKey: pubmedKeys.length > 0 }),
    };
  }
}

/**
 * Fetch + parse PubMed records for an explicit list of PMIDs (single EFetch).
 * Used by neighbour/citation expansion to hydrate related-article PMIDs into full
 * results. Returns [] on error (fail-open).
 */
export async function fetchPubMedByPmids(
  pmids: string[]
): Promise<UnifiedSearchResult[]> {
  if (pmids.length === 0 || !breaker.canRequest()) return [];
  const ids = pmids.slice(0, 50).join(",");
  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids}&rettype=xml&retmode=xml&tool=scholarsync&email=contact@scholarsync.com`;
  try {
    await pubmedLimiter.acquire();
    const res = await resilientFetch(appendApiKey(fetchUrl), {}, { service: "PubMed", timeout: 15000, baseDelay: 400, maxRetries: 2 });
    const xml = await res.text();
    const chunks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
    const results: UnifiedSearchResult[] = [];
    for (const chunk of chunks) {
      const parsed = parseArticle(chunk);
      if (parsed) results.push(parsed);
    }
    breaker.onSuccess();
    return results;
  } catch (error) {
    breaker.onFailure();
    console.error("[PubMed] EFetch-by-PMIDs failed:", error);
    return [];
  }
}

/**
 * Resolve a single DOI to its PubMed PMID via esearch on the Article Identifier
 * field ([AID]). OpenAlex's id graph fills most PMIDs; this is the fallback for
 * DOI-only results not in that graph (the PMID metadata gate). Fail-open: returns
 * null on any error, throttle, or miss.
 */
export async function lookupPmidByDoi(doi: string): Promise<string | null> {
  if (!breaker.canRequest()) return null;
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  if (!clean) return null;
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    `${clean}[AID]`
  )}&retmax=1&retmode=json&tool=scholarsync&email=contact@scholarsync.com`;
  try {
    await pubmedLimiter.acquire();
    const res = await resilientFetch(
      appendApiKey(url),
      {},
      { service: "PubMed", timeout: 8000, baseDelay: 400, maxRetries: 1 }
    );
    const data: PubMedESearchResult = await res.json();
    breaker.onSuccess();
    return data.esearchresult?.idlist?.[0] ?? null;
  } catch {
    breaker.onFailure();
    return null;
  }
}
