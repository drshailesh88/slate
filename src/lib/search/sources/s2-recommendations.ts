import type { UnifiedSearchResult } from "@/types/search";
import { mapS2PublicationType, getEvidenceLevel } from "@/lib/search/evidence-level";
import { searchSemanticScholar } from "./semantic-scholar";

const S2_FIELDS = "title,authors,year,abstract,citationCount,journal,tldr,externalIds,url,publicationTypes,openAccessPdf,fieldsOfStudy";

interface S2RecPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number;
  abstract: string | null;
  citationCount: number;
  journal: { name: string } | null;
  tldr: { text: string } | null;
  externalIds: { DOI?: string; PubMed?: string } | null;
  url: string;
  publicationTypes: string[] | null;
  openAccessPdf: { url: string } | null;
  fieldsOfStudy: { category: string }[] | null;
}

function s2Headers(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  return headers;
}

function mapRecPaper(paper: S2RecPaper): UnifiedSearchResult {
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
    publicationTypes,
    fieldsOfStudy: paper.fieldsOfStudy?.map((f) => f.category) || [],
    isOpenAccess: !!paper.openAccessPdf,
    openAccessPdfUrl: paper.openAccessPdf?.url || null,
    studyType,
    evidenceLevel: evidence.level,
    sources: ["semantic_scholar"],
  };
}

export async function getRecommendationsForPaper(
  paperId: string,
  limit: number = 10,
  paperTitle?: string
): Promise<UnifiedSearchResult[]> {
  const url = `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${paperId}?limit=${limit}&fields=${S2_FIELDS}`;
  const res = await fetch(url, { headers: s2Headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[S2 Recommendations] FAILED for paperId=${paperId} — status=${res.status}, body=${body}`);
    throw new Error(`S2 Recommendations API error: ${res.status}`);
  }
  const data: { recommendedPapers: S2RecPaper[] } = await res.json();
  const results = (data.recommendedPapers || []).map(mapRecPaper);
  console.log(`[S2 Recommendations] OK for paperId=${paperId} — ${results.length} results`);

  // Fallback: if recommendations are empty and we have a title, search by title
  if (results.length === 0 && paperTitle) {
    console.log(`[S2 Recommendations] Empty results, falling back to title search: "${paperTitle}"`);
    try {
      const fallback = await searchSemanticScholar(paperTitle, { limit: limit + 1 });
      // Exclude the original paper from fallback results
      return fallback.results
        .filter((r) => r.s2Id !== paperId)
        .slice(0, limit);
    } catch (err) {
      console.error("[S2 Recommendations] Fallback title search also failed:", err);
    }
  }

  return results;
}

export async function getRecommendationsFromList(
  positivePaperIds: string[],
  negativePaperIds: string[] = [],
  limit: number = 10
): Promise<UnifiedSearchResult[]> {
  const url = `https://api.semanticscholar.org/recommendations/v1/papers/?fields=${S2_FIELDS}&limit=${limit}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...s2Headers() },
    body: JSON.stringify({ positivePaperIds, negativePaperIds }),
  });
  if (!res.ok) {
    throw new Error(`S2 Recommendations API error: ${res.status}`);
  }
  const data: { recommendedPapers: S2RecPaper[] } = await res.json();
  return (data.recommendedPapers || []).map(mapRecPaper);
}
