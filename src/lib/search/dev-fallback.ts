import { promises as fs } from "node:fs";
import path from "node:path";
import type { UnifiedSearchResult } from "@/types/search";

interface CachedSearchFixture {
  source: string;
  query: string;
  results: UnifiedSearchResult[];
  total: number;
}

interface DevelopmentFallbackResults {
  pubmedResults: UnifiedSearchResult[];
  semanticScholarResults: UnifiedSearchResult[];
  openAlexResults: UnifiedSearchResult[];
  clinicalTrialsResults: UnifiedSearchResult[];
}

const CACHE_DIR = path.join(
  process.cwd(),
  "src/lib/search/__tests__/ralph-search/cache"
);

let cachedFixturesPromise: Promise<CachedSearchFixture[]> | null = null;

function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(input: string): string[] {
  return normalizeQuery(input)
    .split(" ")
    .filter((token) => token.length > 2);
}

function scoreQueryMatch(query: string, candidate: string): number {
  const normalizedQuery = normalizeQuery(query);
  const normalizedCandidate = normalizeQuery(candidate);

  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return 2;
  }

  const queryTokens = new Set(tokenizeQuery(normalizedQuery));
  const candidateTokens = new Set(tokenizeQuery(normalizedCandidate));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(queryTokens.size, candidateTokens.size);
}

async function loadFixtures(): Promise<CachedSearchFixture[]> {
  if (!cachedFixturesPromise) {
    cachedFixturesPromise = fs
      .readdir(CACHE_DIR)
      .then((files) =>
        Promise.all(
          files
            .filter((file) => file.endsWith(".json"))
            .map(async (file) => {
              const raw = await fs.readFile(path.join(CACHE_DIR, file), "utf8");
              return JSON.parse(raw) as CachedSearchFixture;
            })
        )
      )
      .catch(() => []);
  }

  return cachedFixturesPromise;
}

export async function getDevelopmentFallbackResults(
  query: string,
  limit: number
): Promise<DevelopmentFallbackResults | null> {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    return null;
  }

  const bestBySource = new Map<
    string,
    { score: number; fixture: CachedSearchFixture }
  >();

  for (const fixture of fixtures) {
    const score = scoreQueryMatch(query, fixture.query);
    if (score < 0.55) continue;

    const current = bestBySource.get(fixture.source);
    if (!current || score > current.score) {
      bestBySource.set(fixture.source, { score, fixture });
    }
  }

  if (bestBySource.size === 0) {
    return null;
  }

  const slice = (source: string) =>
    (bestBySource.get(source)?.fixture.results ?? []).slice(0, limit);

  return {
    pubmedResults: slice("pubmed"),
    semanticScholarResults: slice("semantic_scholar"),
    openAlexResults: slice("openalex"),
    clinicalTrialsResults: slice("clinical_trials"),
  };
}
