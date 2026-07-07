import type { UnifiedSearchResult } from "@/types/search";

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export function isSamePaper(a: UnifiedSearchResult, b: UnifiedSearchResult): boolean {
  // 1. DOI match
  if (a.doi && b.doi && a.doi.toLowerCase() === b.doi.toLowerCase()) return true;
  // 2. PMID match
  if (a.pmid && b.pmid && a.pmid === b.pmid) return true;
  // 3. S2 ID match
  if (a.s2Id && b.s2Id && a.s2Id === b.s2Id) return true;
  // 4. Normalized title + year match
  if (
    a.title &&
    b.title &&
    a.year &&
    b.year &&
    a.year === b.year &&
    normalizeTitle(a.title) === normalizeTitle(b.title)
  ) {
    return true;
  }
  return false;
}

function mergeArrays(a: string[] | undefined, b: string[] | undefined): string[] {
  if (!a && !b) return [];
  if (!a) return b!;
  if (!b) return a;
  return [...new Set([...a, ...b])];
}

export function mergeMetadata(
  primary: UnifiedSearchResult,
  secondary: UnifiedSearchResult
): UnifiedSearchResult {
  return {
    ...primary,
    abstract: primary.abstract || secondary.abstract,
    tldr: primary.tldr || secondary.tldr,
    citationCount: Math.max(primary.citationCount || 0, secondary.citationCount || 0),
    influentialCitationCount:
      primary.influentialCitationCount ?? secondary.influentialCitationCount,
    referenceCount: primary.referenceCount ?? secondary.referenceCount,
    meshTerms: primary.meshTerms?.length ? primary.meshTerms : secondary.meshTerms,
    publicationTypes: mergeArrays(primary.publicationTypes, secondary.publicationTypes),
    fieldsOfStudy: mergeArrays(primary.fieldsOfStudy, secondary.fieldsOfStudy),
    concepts: mergeArrays(primary.concepts, secondary.concepts),
    openAccessPdfUrl: primary.openAccessPdfUrl || secondary.openAccessPdfUrl,
    isOpenAccess: primary.isOpenAccess || secondary.isOpenAccess,
    pmid: primary.pmid || secondary.pmid,
    doi: primary.doi || secondary.doi,
    s2Id: primary.s2Id || secondary.s2Id,
    openalexId: primary.openalexId || secondary.openalexId,
    studyType: primary.studyType || secondary.studyType,
    evidenceLevel: primary.evidenceLevel || secondary.evidenceLevel,
    sources: [...new Set([...primary.sources, ...secondary.sources])],
  };
}

export function deduplicateResults(
  results: UnifiedSearchResult[]
): UnifiedSearchResult[] {
  const unique: UnifiedSearchResult[] = [];

  for (const result of results) {
    const existingIdx = unique.findIndex((u) => isSamePaper(u, result));
    if (existingIdx >= 0) {
      unique[existingIdx] = mergeMetadata(unique[existingIdx], result);
    } else {
      unique.push({ ...result });
    }
  }

  return unique;
}
