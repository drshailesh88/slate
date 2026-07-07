/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Convert raw API responses (from curl) into CachedSourceResults format.
 * Run: npx tsx src/lib/search/__tests__/ralph-search/convert-raw-to-cache.ts
 */
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { UnifiedSearchResult } from "@/types/search";
import { mapPubMedPublicationType, mapS2PublicationType, mapOpenAlexType, getEvidenceLevel } from "@/lib/search/evidence-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "cache");
const QUERY = "What are the effects of SGLT2 inhibitors on heart failure outcomes?";

function cacheKey(source: string): string {
  const hash = createHash("md5")
    .update(`${source}:${QUERY}:max=20`)
    .digest("hex")
    .slice(0, 12);
  return `${source}-${hash}.json`;
}

function stripXmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

// ── Parse PubMed XML ────────────────────────────────────────────────

function parsePubMedXml(xml: string): UnifiedSearchResult[] {
  const articleChunks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  const results: UnifiedSearchResult[] = [];

  for (const article of articleChunks) {
    const titleMatch = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
    const title = titleMatch ? stripXmlTags(titleMatch[1]) : "";
    if (!title) continue;

    const abstractTexts = [...article.matchAll(/<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    const abstract = abstractTexts
      .map((m) => m[1] ? `${m[1]}: ${stripXmlTags(m[2])}` : stripXmlTags(m[2]))
      .join(" ");

    const authorMatches = [...article.matchAll(/<Author[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?(?:<ForeName>([\s\S]*?)<\/ForeName>)?[\s\S]*?<\/Author>/g)];
    const authors = authorMatches.map((m) => {
      const lastName = stripXmlTags(m[1]);
      const foreName = m[2] ? stripXmlTags(m[2]) : "";
      return foreName ? `${lastName} ${foreName}` : lastName;
    });

    const journalMatch = article.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/) || article.match(/<Title>([\s\S]*?)<\/Title>/);
    const journal = journalMatch ? stripXmlTags(journalMatch[1]) : "";

    const yearMatch = article.match(/<PubDate>[\s\S]*?<Year>([\s\S]*?)<\/Year>/) || article.match(/<PubDate>[\s\S]*?<MedlineDate>([\s\S]*?)<\/MedlineDate>/);
    const yearStr = yearMatch ? stripXmlTags(yearMatch[1]) : "";
    const yearNumMatch = yearStr.match(/(\d{4})/);
    const year = yearNumMatch ? parseInt(yearNumMatch[1], 10) : 0;

    const doiMatch = article.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
    const doi = doiMatch ? stripXmlTags(doiMatch[1]) : undefined;

    const pmidMatch = article.match(/<PMID[^>]*>([\s\S]*?)<\/PMID>/);
    const pmid = pmidMatch ? stripXmlTags(pmidMatch[1]) : "";

    const pubTypeMatches = [...article.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)];
    const publicationTypes = pubTypeMatches.map((m) => stripXmlTags(m[1]));

    const meshMatches = [...article.matchAll(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g)];
    const meshTerms = meshMatches.map((m) => stripXmlTags(m[1]));

    let studyType = "other";
    for (const pt of publicationTypes) {
      const mapped = mapPubMedPublicationType(pt);
      if (mapped !== "other") { studyType = mapped; break; }
    }
    const evidence = getEvidenceLevel(studyType);

    results.push({
      title, authors, journal, year, doi, pmid,
      abstract: abstract || undefined,
      citationCount: 0,
      publicationTypes, meshTerms, studyType,
      evidenceLevel: evidence.level,
      isOpenAccess: false,
      sources: ["pubmed"],
    });
  }
  return results;
}

// ── Parse S2 JSON ───────────────────────────────────────────────────

function parseS2Json(raw: any): UnifiedSearchResult[] {
  const papers = raw.data || [];
  return papers.map((p: any) => {
    const publicationTypes = p.publicationTypes || [];
    let studyType = "other";
    for (const pt of publicationTypes) {
      const mapped = mapS2PublicationType(pt);
      if (mapped !== "other") { studyType = mapped; break; }
    }
    const evidence = getEvidenceLevel(studyType);

    return {
      title: p.title || "",
      authors: (p.authors || []).map((a: any) => a.name),
      journal: p.journal?.name || "",
      year: p.year || 0,
      doi: p.externalIds?.DOI || undefined,
      pmid: p.externalIds?.PubMed || undefined,
      s2Id: p.paperId,
      abstract: p.abstract || undefined,
      tldr: p.tldr?.text || undefined,
      citationCount: p.citationCount || 0,
      influentialCitationCount: p.influentialCitationCount || 0,
      referenceCount: p.referenceCount || 0,
      publicationTypes,
      fieldsOfStudy: (p.fieldsOfStudy || []).map((f: any) => f.category),
      isOpenAccess: p.isOpenAccess || false,
      openAccessPdfUrl: p.openAccessPdf?.url || null,
      studyType,
      evidenceLevel: evidence.level,
      sources: ["semantic_scholar"],
    } as UnifiedSearchResult;
  });
}

// ── Parse OpenAlex JSON ─────────────────────────────────────────────

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return "";
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) { words.push([word, pos]); }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map((w) => w[0]).join(" ");
}

function parseOpenAlexJson(raw: any): UnifiedSearchResult[] {
  const works = raw.results || [];
  return works.map((w: any) => {
    const studyType = mapOpenAlexType(w.type || "");
    const evidence = getEvidenceLevel(studyType);
    const doi = w.doi ? w.doi.replace("https://doi.org/", "") : undefined;

    return {
      title: w.display_name || w.title || "",
      authors: (w.authorships || []).map((a: any) => a.author.display_name),
      journal: w.primary_location?.source?.display_name || "",
      year: w.publication_year || 0,
      doi,
      openalexId: w.id,
      abstract: reconstructAbstract(w.abstract_inverted_index) || undefined,
      citationCount: w.cited_by_count || 0,
      isOpenAccess: w.is_oa || false,
      openAccessPdfUrl: w.open_access?.oa_url || null,
      publicationTypes: w.type ? [w.type] : [],
      concepts: (w.concepts || []).filter((c: any) => c.score > 0.3).map((c: any) => c.display_name),
      studyType,
      evidenceLevel: evidence.level,
      sources: ["openalex"],
    } as UnifiedSearchResult;
  });
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const timestamp = new Date().toISOString();

  // PubMed
  const xmlPath = path.join(CACHE_DIR, "pubmed-raw.xml");
  if (existsSync(xmlPath)) {
    const xml = readFileSync(xmlPath, "utf-8");
    const results = parsePubMedXml(xml);
    const esearchData = JSON.parse(readFileSync(path.join(CACHE_DIR, "pubmed-esearch.json"), "utf-8"));
    const total = parseInt(esearchData.esearchresult.count, 10);
    const key = cacheKey("pubmed");
    writeFileSync(
      path.join(CACHE_DIR, key),
      JSON.stringify({ source: "pubmed", query: QUERY, timestamp, results, total }, null, 2)
    );
    console.log(`PubMed: ${results.length} results → ${key}`);
    for (const r of results.slice(0, 5)) {
      console.log(`  [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
  }

  // S2
  const s2Path = path.join(CACHE_DIR, "s2-raw.json");
  if (existsSync(s2Path)) {
    const raw = JSON.parse(readFileSync(s2Path, "utf-8"));
    const results = parseS2Json(raw);
    const key = cacheKey("semantic_scholar");
    writeFileSync(
      path.join(CACHE_DIR, key),
      JSON.stringify({ source: "semantic_scholar", query: QUERY, timestamp, results, total: raw.total || results.length }, null, 2)
    );
    console.log(`\nS2: ${results.length} results → ${key}`);
    for (const r of results.slice(0, 5)) {
      console.log(`  [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
  }

  // OpenAlex
  const oaPath = path.join(CACHE_DIR, "oa-raw.json");
  if (existsSync(oaPath)) {
    const raw = JSON.parse(readFileSync(oaPath, "utf-8"));
    const results = parseOpenAlexJson(raw);
    const key = cacheKey("openalex");
    writeFileSync(
      path.join(CACHE_DIR, key),
      JSON.stringify({ source: "openalex", query: QUERY, timestamp, results, total: raw.meta?.count || results.length }, null, 2)
    );
    console.log(`\nOpenAlex: ${results.length} results → ${key}`);
    for (const r of results.slice(0, 5)) {
      console.log(`  [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
  }

  console.log("\nDone. Run tests with: npx vitest run src/lib/search/__tests__/ralph-search/runner.test.ts");
}

main();
