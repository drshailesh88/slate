/**
 * Populate cache for all RALPH test queries.
 *
 * Calls each source separately. PubMed uses resilientFetch directly
 * (there's a known hang when searchPubMed makes rapid sequential calls
 * from vitest — PubMed silently throttles efetch body streaming).
 *
 * Run: npx vitest run src/lib/search/__tests__/ralph-search/populate-cache.test.ts
 */
import { describe, it } from "vitest";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { mapPubMedPublicationType, getEvidenceLevel } from "@/lib/search/evidence-level";

const CASES_DIR = path.resolve(__dirname, "cases");
const CACHE_DIR = path.resolve(__dirname, "cache");

// ── Cache helpers ─────────────────────────────────────────────
function cacheKey(source: string, query: string, opts: string): string {
  const hash = createHash("md5")
    .update(`${source}:${query}:${opts}`)
    .digest("hex")
    .slice(0, 12);
  return `${source}-${hash}.json`;
}

function hasCached(source: string, query: string, maxResults: number): boolean {
  const key = cacheKey(source, query, `max=${maxResults}`);
  return existsSync(path.join(CACHE_DIR, key));
}

interface CachedSourceResults {
  source: string;
  query: string;
  timestamp: string;
  results: UnifiedSearchResult[];
  total: number;
}

function writeCache(source: string, query: string, maxResults: number, data: CachedSourceResults): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(source, query, `max=${maxResults}`);
  writeFileSync(path.join(CACHE_DIR, key), JSON.stringify(data, null, 2), "utf-8");
  console.log(`    Wrote ${key} (${data.results.length} results)`);
}

// ── PubMed via resilientFetch (avoids searchPubMed hang) ──────
function stripXmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

async function fetchPubMedDirect(query: string, maxResults: number): Promise<CachedSourceResults> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retstart=0&retmode=json&tool=scholarsync&email=contact@scholarsync.com`;

  const searchRes = await resilientFetch(searchUrl, {}, { service: "PubMed-populate", timeout: 15000 });
  const searchData = await searchRes.json() as { esearchresult: { idlist: string[]; count: string } };
  const pmids = searchData.esearchresult.idlist;
  const total = parseInt(searchData.esearchresult.count, 10);

  if (pmids.length === 0) {
    return { source: "pubmed", query, timestamp: new Date().toISOString(), results: [], total: 0 };
  }

  // 500ms delay to respect PubMed rate limit
  await new Promise(r => setTimeout(r, 500));

  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=xml&retmode=xml&tool=scholarsync&email=contact@scholarsync.com`;
  const fetchRes = await resilientFetch(fetchUrl, {}, { service: "PubMed-populate", timeout: 30000 });
  const xml = await fetchRes.text();

  const articleChunks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  const results: UnifiedSearchResult[] = [];

  for (const article of articleChunks) {
    const titleMatch = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
    const title = titleMatch ? stripXmlTags(titleMatch[1]) : "";
    if (!title) continue;

    const abstractTexts = [...article.matchAll(/<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    const abstract = abstractTexts.map(m => {
      const label = m[1];
      const text = stripXmlTags(m[2]);
      return label ? `${label}: ${text}` : text;
    }).join(" ");

    const authorMatches = [...article.matchAll(/<LastName>([^<]*)<\/LastName>[\s\S]*?<ForeName>([^<]*)<\/ForeName>/g)];
    const authors = authorMatches.map(m => `${m[2]} ${m[1]}`);

    const yearMatch = article.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;

    const journalMatch = article.match(/<Title>([^<]*)<\/Title>/);
    const journal = journalMatch ? stripXmlTags(journalMatch[1]) : "";

    const doiMatch = article.match(/<ArticleId IdType="doi">([^<]*)<\/ArticleId>/);
    const doi = doiMatch ? doiMatch[1] : undefined;

    const pmidMatch = article.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const pmid = pmidMatch ? pmidMatch[1] : "";

    const pubTypes = [...article.matchAll(/<PublicationType[^>]*>([^<]*)<\/PublicationType>/g)].map(m => m[1]);
    const meshTerms = [...article.matchAll(/<DescriptorName[^>]*>([^<]*)<\/DescriptorName>/g)].map(m => m[1]);

    const mapped = pubTypes.map(pt => mapPubMedPublicationType(pt));
    const studyType = mapped.find(t => t !== "other") || "other";
    const evidence = getEvidenceLevel(studyType);

    results.push({
      title,
      abstract,
      authors,
      year,
      journal,
      doi,
      pmid,
      citationCount: 0,
      publicationTypes: pubTypes,
      meshTerms,
      studyType,
      evidenceLevel: evidence.level,
      isOpenAccess: false,
      sources: ["pubmed"],
    });
  }

  return { source: "pubmed", query, timestamp: new Date().toISOString(), results, total };
}

// ── Semantic Scholar ──────────────────────────────────────────
async function fetchSemanticScholarDirect(query: string, maxResults: number): Promise<CachedSourceResults> {
  const { searchSemanticScholar } = await import("@/lib/search/sources/semantic-scholar");
  const result = await searchSemanticScholar(query, { limit: maxResults });
  return { source: "semantic_scholar", query, timestamp: new Date().toISOString(), results: result.results, total: result.total };
}

// ── OpenAlex ─────────────────────────────────────────────────
async function fetchOpenAlexDirect(query: string, maxResults: number): Promise<CachedSourceResults> {
  const { searchOpenAlex } = await import("@/lib/search/sources/openalex");
  const result = await searchOpenAlex(query, { limit: maxResults });
  return { source: "openalex", query, timestamp: new Date().toISOString(), results: result.results, total: result.total };
}

// ── Main test ─────────────────────────────────────────────────
describe("Populate cache", () => {
  const files = readdirSync(CASES_DIR).filter(f => f.endsWith(".json")).sort();
  const queries = new Map<string, string>();
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf-8"));
    if (!queries.has(data.query)) {
      queries.set(data.query, file);
    }
  }

  const MAX = 20;

  for (const [query, file] of queries) {
    it(`cache: ${file} — ${query.slice(0, 50)}`, async () => {
      const sources = [
        { name: "pubmed", fn: () => fetchPubMedDirect(query, MAX) },
        { name: "semantic_scholar", fn: () => fetchSemanticScholarDirect(query, MAX) },
        { name: "openalex", fn: () => fetchOpenAlexDirect(query, MAX) },
      ];

      let fetched = 0;
      for (const src of sources) {
        if (hasCached(src.name, query, MAX)) {
          console.log(`  [${src.name}] cached ✓`);
          continue;
        }

        // 2s delay between live API calls
        if (fetched > 0) await new Promise(r => setTimeout(r, 2000));

        try {
          console.log(`  [${src.name}] fetching...`);
          const data = await src.fn();
          writeCache(src.name, query, MAX, data);
          fetched++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  [${src.name}] ERROR: ${msg}`);
        }
      }
    }, 120000);
  }
});
