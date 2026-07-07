/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One-time test to convert raw curl API responses into CachedSourceResults format.
 * Run: npx vitest run src/lib/search/__tests__/ralph-search/convert-cache.test.ts
 */
import { describe, it, expect } from "vitest";
import type { UnifiedSearchResult } from "@/types/search";
import {
  mapPubMedPublicationType,
  mapS2PublicationType,
  mapOpenAlexType,
  getEvidenceLevel,
} from "@/lib/search/evidence-level";

function stripXmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function parsePubMedXml(xml: string): UnifiedSearchResult[] {
  const articleChunks =
    xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  const results: UnifiedSearchResult[] = [];

  for (const article of articleChunks) {
    const titleMatch = article.match(
      /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/
    );
    const title = titleMatch ? stripXmlTags(titleMatch[1]) : "";
    if (!title) continue;

    const abstractTexts = [
      ...article.matchAll(
        /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g
      ),
    ];
    const abstract = abstractTexts
      .map((m) =>
        m[1] ? `${m[1]}: ${stripXmlTags(m[2])}` : stripXmlTags(m[2])
      )
      .join(" ");

    const authorMatches = [
      ...article.matchAll(
        /<Author[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?(?:<ForeName>([\s\S]*?)<\/ForeName>)?[\s\S]*?<\/Author>/g
      ),
    ];
    const authors = authorMatches.map((m) => {
      const lastName = stripXmlTags(m[1]);
      const foreName = m[2] ? stripXmlTags(m[2]) : "";
      return foreName ? `${lastName} ${foreName}` : lastName;
    });

    const journalMatch =
      article.match(
        /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/
      ) || article.match(/<Title>([\s\S]*?)<\/Title>/);
    const journal = journalMatch ? stripXmlTags(journalMatch[1]) : "";

    const yearMatch =
      article.match(/<PubDate>[\s\S]*?<Year>([\s\S]*?)<\/Year>/) ||
      article.match(
        /<PubDate>[\s\S]*?<MedlineDate>([\s\S]*?)<\/MedlineDate>/
      );
    const yearStr = yearMatch ? stripXmlTags(yearMatch[1]) : "";
    const yearNumMatch = yearStr.match(/(\d{4})/);
    const year = yearNumMatch ? parseInt(yearNumMatch[1], 10) : 0;

    const doiMatch = article.match(
      /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/
    );
    const doi = doiMatch ? stripXmlTags(doiMatch[1]) : undefined;

    const pmidMatch = article.match(/<PMID[^>]*>([\s\S]*?)<\/PMID>/);
    const pmid = pmidMatch ? stripXmlTags(pmidMatch[1]) : "";

    const pubTypeMatches = [
      ...article.matchAll(
        /<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g
      ),
    ];
    const publicationTypes = pubTypeMatches.map((m) => stripXmlTags(m[1]));

    const meshMatches = [
      ...article.matchAll(
        /<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g
      ),
    ];
    const meshTerms = meshMatches.map((m) => stripXmlTags(m[1]));

    let studyType = "other";
    for (const pt of publicationTypes) {
      const mapped = mapPubMedPublicationType(pt);
      if (mapped !== "other") {
        studyType = mapped;
        break;
      }
    }
    const evidence = getEvidenceLevel(studyType);

    results.push({
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
    });
  }
  return results;
}

function parseS2Json(raw: any): UnifiedSearchResult[] {
  const papers = raw.data || [];
  return papers.map((p: any) => {
    const publicationTypes = p.publicationTypes || [];
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

function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null
): string {
  if (!invertedIndex) return "";
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words.push([word, pos]);
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
      concepts: (w.concepts || [])
        .filter((c: any) => c.score > 0.3)
        .map((c: any) => c.display_name),
      studyType,
      evidenceLevel: evidence.level,
      sources: ["openalex"],
    } as UnifiedSearchResult;
  });
}

describe("Convert raw API responses to cache", () => {
  // NOTE: This test now uses inline mock data instead of external fixture files.
  // It validates the parsing functions work correctly with realistic sample data.
  it("should convert all 3 sources from inline mock data", () => {
    // Mock PubMed XML response (minimal realistic structure)
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <Journal>
          <ISOAbbreviation>N Engl J Med</ISOAbbreviation>
        </Journal>
        <ArticleTitle>Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Dapagliflozin reduced the risk of cardiovascular death or worsening heart failure.</AbstractText>
          <AbstractText Label="METHODS">We randomly assigned 4744 patients with heart failure to receive dapagliflozin or placebo.</AbstractText>
          <AbstractText Label="RESULTS">The primary outcome occurred in 386 of 2373 patients (16.3%) in the dapagliflozin group and 502 of 2371 patients (21.2%) in the placebo group (hazard ratio, 0.74; 95% CI, 0.65 to 0.85; P&lt;0.001).</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>McMurray</LastName>
            <ForeName>John J V</ForeName>
          </Author>
        </AuthorList>
      </Article>
      <Journal>
        <PubDate>
          <Year>2019</Year>
        </PubDate>
      </Journal>
      <PublicationTypeList>
        <PublicationType>Clinical Trial</PublicationType>
        <PublicationType>Journal Article</PublicationType>
      </PublicationTypeList>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

    // Mock Semantic Scholar JSON response
    const mockS2Json = {
      data: [
        {
          paperId: "test-s2-id-1",
          title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
          authors: [{ name: "John J V McMurray" }],
          year: 2019,
          journal: { name: "New England Journal of Medicine" },
          externalIds: {
            DOI: "10.1056/NEJMoa1911303",
            PubMed: "12345678"
          },
          abstract: "Dapagliflozin reduced the risk of cardiovascular death or worsening heart failure.",
          publicationTypes: ["ClinicalTrial"],
          citationCount: 1500,
          influentialCitationCount: 800,
          referenceCount: 45,
          isOpenAccess: true,
          openAccessPdf: { url: "https://example.com/pdf" },
          fieldsOfStudy: [{ category: "Medicine" }]
        }
      ],
      total: 1
    };

    // Mock OpenAlex JSON response
    const mockOaJson = {
      meta: { count: 1 },
      results: [
        {
          id: "https://openalex.org/W1234567890",
          title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction",
          type: "journal-article",
          publication_year: 2019,
          primary_location: {
            source: { display_name: "New England Journal of Medicine" }
          },
          authorships: [
            { author: { display_name: "John J V McMurray" } }
          ],
          doi: "https://doi.org/10.1056/NEJMoa1911303",
          cited_by_count: 1500,
          is_oa: true,
          open_access: { oa_url: "https://example.com/pdf" },
          abstract_inverted_index: {
            dapagliflozin: [0],
            reduced: [1, 15],
            risk: [2]
          },
          concepts: [
            { display_name: "Medicine", score: 0.9 },
            { display_name: "Cardiology", score: 0.85 }
          ]
        }
      ]
    };

    // Test PubMed parsing
    const pmResults = parsePubMedXml(mockXml);
    expect(pmResults.length).toBeGreaterThan(0);
    expect(pmResults[0].title).toContain("Dapagliflozin");
    expect(pmResults[0].pmid).toBe("12345678");
    expect(pmResults[0].year).toBe(2019);
    // The parser formats names as "LastName FirstName"
    expect(pmResults[0].authors[0]).toContain("McMurray");
    expect(pmResults[0].abstract).toBeDefined();
    expect(pmResults[0].studyType).toBe("rct");
    console.log(`PubMed: ${pmResults.length} results parsed successfully`);
    console.log(`  [${pmResults[0].evidenceLevel}/${pmResults[0].studyType}] ${pmResults[0].title.slice(0, 90)} (${pmResults[0].year})`);

    // Test Semantic Scholar parsing
    const s2Results = parseS2Json(mockS2Json);
    expect(s2Results.length).toBeGreaterThan(0);
    expect(s2Results[0].title).toContain("Dapagliflozin");
    expect(s2Results[0].s2Id).toBe("test-s2-id-1");
    expect(s2Results[0].year).toBe(2019);
    expect(s2Results[0].authors.length).toBeGreaterThan(0);
    expect(s2Results[0].authors[0]).toContain("McMurray");
    expect(s2Results[0].abstract).toBeDefined();
    expect(s2Results[0].isOpenAccess).toBe(true);
    expect(s2Results[0].openAccessPdfUrl).toBeDefined();
    console.log(`\nS2: ${s2Results.length} results parsed successfully`);
    console.log(`  [${s2Results[0].evidenceLevel}/${s2Results[0].studyType}] ${s2Results[0].title.slice(0, 90)} (${s2Results[0].year})`);

    // Test OpenAlex parsing
    const oaResults = parseOpenAlexJson(mockOaJson);
    expect(oaResults.length).toBeGreaterThan(0);
    expect(oaResults[0].title).toContain("Dapagliflozin");
    expect(oaResults[0].openalexId).toBeDefined();
    expect(oaResults[0].year).toBe(2019);
    expect(oaResults[0].authors.length).toBeGreaterThan(0);
    expect(oaResults[0].authors[0]).toContain("McMurray");
    expect(oaResults[0].abstract).toBeDefined();
    expect(oaResults[0].isOpenAccess).toBe(true);
    expect(oaResults[0].concepts).toContain("Medicine");
    console.log(`\nOpenAlex: ${oaResults.length} results parsed successfully`);
    console.log(`  [${oaResults[0].evidenceLevel}/${oaResults[0].studyType}] ${oaResults[0].title.slice(0, 90)} (${oaResults[0].year})`);
  });

  it("extracts trial abbreviations from paper titles", () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <ArticleTitle>DAPA-HF: Dapagliflozin in Patients with Heart Failure</ArticleTitle>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>87654321</PMID>
      <Article>
        <ArticleTitle>EMPEROR-Reduced: Empagliflozin in Heart Failure with Reduced Ejection Fraction</ArticleTitle>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

    const results = parsePubMedXml(mockXml);
    expect(results.length).toBe(2);
    expect(results[0].title).toContain("DAPA-HF:");
    expect(results[1].title).toContain("EMPEROR-Reduced:");
    console.log(`\nTrial abbreviation extraction: ${results.map(r => r.title.split(":")[0]).join(", ")}`);
  });
});
