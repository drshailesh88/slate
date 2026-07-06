import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { UnifiedSearchResult } from "@/types/search";
import { reciprocalRankFusion } from "@/lib/search/rank-fusion";
import { deduplicateResults } from "@/lib/search/dedup";
import { enrichJournalQuality, qualityRank } from "@/lib/search/quality-ranker";
import { enrichStudyTypes } from "@/lib/search/study-type-detector";
import { expandQuery } from "@/lib/search/query-expander";
import type {
  SearchTestCase,
  CycleResult,
  Scorecard,
  CachedSourceResults,
} from "./types";
import { scoreAll } from "./scorer";

// ── Cache helpers ───────────────────────────────────────────────────

const CACHE_DIR = path.resolve(
  __dirname,
  "cache"
);

function cacheKey(source: string, query: string, opts: string): string {
  const hash = createHash("md5")
    .update(`${source}:${query}:${opts}`)
    .digest("hex")
    .slice(0, 12);
  return `${source}-${hash}.json`;
}

function readCache(filename: string): CachedSourceResults | null {
  const filepath = path.join(CACHE_DIR, filename);
  if (!existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

function writeCache(filename: string, data: CachedSourceResults): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    path.join(CACHE_DIR, filename),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

// ── Source adapters (lazy-imported to avoid module-level side effects) ──

async function fetchPubMed(
  query: string,
  maxResults: number
): Promise<{ results: UnifiedSearchResult[]; total: number }> {
  const { searchPubMed } = await import(
    "@/lib/search/sources/pubmed"
  );
  return searchPubMed(query, { maxResults });
}

async function fetchSemanticScholar(
  query: string,
  maxResults: number
): Promise<{ results: UnifiedSearchResult[]; total: number }> {
  const { searchSemanticScholar } = await import(
    "@/lib/search/sources/semantic-scholar"
  );
  return searchSemanticScholar(query, { limit: maxResults });
}

async function fetchOpenAlex(
  query: string,
  maxResults: number
): Promise<{ results: UnifiedSearchResult[]; total: number }> {
  const { searchOpenAlex } = await import(
    "@/lib/search/sources/openalex"
  );
  return searchOpenAlex(query, { limit: maxResults });
}

async function fetchClinicalTrials(
  query: string,
  maxResults: number
): Promise<{ results: UnifiedSearchResult[]; total: number }> {
  const { searchClinicalTrials } = await import(
    "@/lib/search/sources/clinical-trials"
  );
  return searchClinicalTrials(query, { limit: maxResults });
}

// ── Run a single source (with caching) ─────────────────────────────

async function runSource(
  source: string,
  query: string,
  maxResults: number,
  live: boolean
): Promise<CachedSourceResults> {
  const key = cacheKey(source, query, `max=${maxResults}`);

  // Always check cache first — even in live mode, use cached results if available
  const existing = readCache(key);
  if (existing) {
    console.log(`  [${source}] Using cached results (${existing.results.length} papers)`);
    return existing;
  }

  if (!live) {
    throw new Error(
      `[${source}] No cached results for query "${query}" — run in live mode first`
    );
  }

  // Live mode — call real API (cache miss)
  console.log(`  [${source}] Calling API...`);

  let result: { results: UnifiedSearchResult[]; total: number };
  switch (source) {
    case "pubmed":
      result = await fetchPubMed(query, maxResults);
      break;
    case "semantic_scholar":
      result = await fetchSemanticScholar(query, maxResults);
      break;
    case "openalex":
      result = await fetchOpenAlex(query, maxResults);
      break;
    case "clinical_trials":
      result = await fetchClinicalTrials(query, maxResults);
      break;
    default:
      throw new Error(`Unknown source: ${source}`);
  }

  console.log(`  [${source}] Got ${result.results.length} results (total: ${result.total})`);

  const cached: CachedSourceResults = {
    source,
    query,
    timestamp: new Date().toISOString(),
    results: result.results,
    total: result.total,
  };

  writeCache(key, cached);
  return cached;
}

// ── Main runner ─────────────────────────────────────────────────────

export interface RunResult {
  /** Per-source raw results */
  perSource: {
    pubmed: CachedSourceResults;
    semanticScholar: CachedSourceResults;
    openAlex: CachedSourceResults;
    clinicalTrials?: CachedSourceResults;
  };
  /** After RRF fusion */
  fused: UnifiedSearchResult[];
  /** After deduplication */
  deduped: UnifiedSearchResult[];
}

export interface RunSearchOptions {
  maxPerSource?: number;
  live?: boolean;
  includeClinicalTrials?: boolean;
}

export async function runSearch(
  query: string,
  maxPerSourceOrOpts: number | RunSearchOptions = 20,
  live: boolean = false
): Promise<RunResult> {
  // Support both old (maxPerSource, live) and new (options object) signatures
  let maxPerSource: number;
  let includeClinicalTrials: boolean;
  if (typeof maxPerSourceOrOpts === "object") {
    maxPerSource = maxPerSourceOrOpts.maxPerSource ?? 20;
    live = maxPerSourceOrOpts.live ?? false;
    includeClinicalTrials = maxPerSourceOrOpts.includeClinicalTrials ?? false;
  } else {
    maxPerSource = maxPerSourceOrOpts;
    includeClinicalTrials = false;
  }

  console.log(`\n  Running search: "${query}" (live=${live}, max=${maxPerSource}, ct=${includeClinicalTrials})`);

  // Run all three sources (sequentially to be kind to rate limits in live mode)
  const pubmed = await runSource("pubmed", query, maxPerSource, live);
  if (live) await new Promise(r => setTimeout(r, 1500)); // rate-limit courtesy delay
  const semanticScholar = await runSource(
    "semantic_scholar",
    query,
    maxPerSource,
    live
  );
  if (live) await new Promise(r => setTimeout(r, 500));
  const openAlex = await runSource("openalex", query, maxPerSource, live);

  // Optional: ClinicalTrials.gov
  let clinicalTrials: CachedSourceResults | undefined;
  if (includeClinicalTrials) {
    try {
      clinicalTrials = await runSource("clinical_trials", query, maxPerSource, live);
    } catch {
      console.log("  [clinical_trials] Cache miss (skipping)");
    }
  }

  // Query expansion: supplementary PubMed search with drug-level synonyms
  const expansion = expandQuery(query);
  let supplementaryPubmed: CachedSourceResults | null = null;
  if (expansion.supplementary) {
    console.log(`  Query expansion: ${expansion.expansions.map(e => `${e.term} → +${e.synonyms.length} synonyms`).join(", ")}`);
    if (live) await new Promise(r => setTimeout(r, 1500)); // rate-limit courtesy delay before supplementary PubMed
    try {
      supplementaryPubmed = await runSource(
        "pubmed",
        expansion.supplementary,
        maxPerSource,
        live
      );
      console.log(`  Supplementary PubMed: ${supplementaryPubmed.results.length} additional papers`);
    } catch {
      console.log(`  Supplementary PubMed: cache miss (skipping — run in live mode to fetch)`);
    }
  }

  // Build RRF input — include supplementary results as a separate ranked list
  const rrfSources: { source: string; results: UnifiedSearchResult[] }[] = [
    { source: "pubmed", results: pubmed.results },
    { source: "semantic_scholar", results: semanticScholar.results },
    { source: "openalex", results: openAlex.results },
  ];
  if (supplementaryPubmed && supplementaryPubmed.results.length > 0) {
    rrfSources.push({
      source: "pubmed_expanded",
      results: supplementaryPubmed.results,
    });
  }
  if (clinicalTrials && clinicalTrials.results.length > 0) {
    rrfSources.push({
      source: "clinical_trials",
      results: clinicalTrials.results,
    });
  }

  // Reciprocal Rank Fusion
  const fused = reciprocalRankFusion(rrfSources);

  console.log(`  Fused: ${fused.length} results`);

  // Deduplication (additional pass — RRF already does some)
  const deduped = deduplicateResults(fused);
  console.log(`  After dedup: ${deduped.length} results`);

  // Detect study types from titles/abstracts for papers classified as "other"
  const studyTypeUpgrades = enrichStudyTypes(deduped);
  console.log(`  Study type detection: upgraded ${studyTypeUpgrades}/${deduped.length} papers`);

  // Enrich with journal quality data from Scimago
  enrichJournalQuality(deduped);
  const enrichedCount = deduped.filter((r) => r.journalQuartile).length;
  console.log(`  Journal quality enriched: ${enrichedCount}/${deduped.length}`);

  // Quality-weighted re-ranking
  const ranked = qualityRank(deduped, query);
  console.log(`  Quality ranked: ${ranked.length} results`);

  return {
    perSource: { pubmed, semanticScholar, openAlex, clinicalTrials },
    fused,
    deduped: ranked,
  };
}

// ── Score a cycle ───────────────────────────────────────────────────

export function scoreCycle(
  testCase: SearchTestCase,
  runResult: RunResult,
  patchesApplied: string[] = []
): CycleResult {
  const { scores, weighted, pass, details } = scoreAll(
    runResult.deduped,
    testCase
  );

  return {
    id: testCase.id,
    name: testCase.name,
    phase: testCase.phase,
    scores,
    weighted,
    pass,
    scoreDetails: details,
    patchesApplied,
    regressionResults: patchesApplied.length === 0 ? "N/A — baseline" : "",
    perSourceCounts: {
      pubmed: runResult.perSource.pubmed.results.length,
      semanticScholar: runResult.perSource.semanticScholar.results.length,
      openAlex: runResult.perSource.openAlex.results.length,
    },
    fusedCount: runResult.fused.length,
    dedupedCount: runResult.deduped.length,
    timestamp: new Date().toISOString(),
  };
}

// ── Scorecard management ────────────────────────────────────────────

const SCORECARD_PATH = path.resolve(__dirname, "scorecard.json");

export function loadScorecard(): Scorecard {
  if (existsSync(SCORECARD_PATH)) {
    return JSON.parse(readFileSync(SCORECARD_PATH, "utf-8"));
  }
  return {
    cycles: [],
    phaseAverages: { phase1: 0, phase2: 0, phase3: 0 },
    totalPassing: 0,
    totalFailing: 0,
  };
}

export function saveScorecard(scorecard: Scorecard): void {
  // Recompute aggregates
  const phase1 = scorecard.cycles.filter((c) => c.phase === 1);
  const phase2 = scorecard.cycles.filter((c) => c.phase === 2);
  const phase3 = scorecard.cycles.filter((c) => c.phase === 3);

  scorecard.phaseAverages = {
    phase1:
      phase1.length > 0
        ? Math.round(
            (phase1.reduce((s, c) => s + c.weighted, 0) / phase1.length) * 10
          ) / 10
        : 0,
    phase2:
      phase2.length > 0
        ? Math.round(
            (phase2.reduce((s, c) => s + c.weighted, 0) / phase2.length) * 10
          ) / 10
        : 0,
    phase3:
      phase3.length > 0
        ? Math.round(
            (phase3.reduce((s, c) => s + c.weighted, 0) / phase3.length) * 10
          ) / 10
        : 0,
  };

  scorecard.totalPassing = scorecard.cycles.filter((c) => c.pass).length;
  scorecard.totalFailing = scorecard.cycles.filter((c) => !c.pass).length;

  writeFileSync(SCORECARD_PATH, JSON.stringify(scorecard, null, 2), "utf-8");
}

// ── Synthesis prompt verification ────────────────────────────────────

export async function verifySynthesisPrompt(
  results: UnifiedSearchResult[],
  query: string,
  reportType: "quick_summary" | "literature_review" | "evidence_summary" = "quick_summary"
): Promise<{
  score: number;
  details: string[];
  prompt: { system: string; user: string };
}> {
  const { buildSynthesisPrompt } = await import("@/lib/research/synthesis");

  // Extend UnifiedSearchResult with PaperResult-required fields for prompt building.
  const papers = results.slice(0, 15).map((r, idx) => ({
    ...r,
    id: `test-${idx}`,
    verificationStatus: "pending" as const,
    source: "pubmed" as const,
  }));

  const prompt = buildSynthesisPrompt({ papers, reportType });
  const details: string[] = [];
  let checks = 0;
  let passed = 0;

  // Check 1: All papers included with [N] numbering
  checks++;
  const paperNumbers = prompt.user.match(/\[\d+\]/g) || [];
  const uniqueNumbers = new Set(paperNumbers.map((n: string) => n));
  if (uniqueNumbers.size >= papers.length) {
    passed++;
    details.push(`✓ All ${papers.length} papers numbered [1]-[${papers.length}]`);
  } else {
    details.push(`✗ Only ${uniqueNumbers.size}/${papers.length} papers numbered`);
  }

  // Check 2: Papers have titles in prompt
  checks++;
  const titlesIncluded = papers.filter((p) =>
    prompt.user.includes(p.title.slice(0, 40))
  ).length;
  if (titlesIncluded >= papers.length * 0.9) {
    passed++;
    details.push(`✓ ${titlesIncluded}/${papers.length} paper titles in prompt`);
  } else {
    details.push(`✗ Only ${titlesIncluded}/${papers.length} paper titles in prompt`);
  }

  // Check 3: Abstracts included
  checks++;
  const withAbstract = papers.filter((p) => p.abstract && prompt.user.includes(p.abstract.slice(0, 50))).length;
  const abstractRatio = withAbstract / papers.filter((p) => p.abstract).length;
  if (abstractRatio >= 0.8) {
    passed++;
    details.push(`✓ ${withAbstract} paper abstracts included in prompt`);
  } else {
    details.push(`✗ Only ${withAbstract} paper abstracts in prompt`);
  }

  // Check 4: System prompt has citation instructions
  checks++;
  if (prompt.system.includes("[N]") || prompt.system.includes("cite")) {
    passed++;
    details.push("✓ System prompt includes citation instructions");
  } else {
    details.push("✗ System prompt missing citation instructions");
  }

  // Check 5: System prompt has theme organization instruction
  checks++;
  if (prompt.system.includes("theme") || prompt.system.includes("organize")) {
    passed++;
    details.push("✓ System prompt instructs thematic organization");
  } else {
    details.push("✗ System prompt missing thematic organization instruction");
  }

  const score = (passed / checks) * 10;
  return { score: Math.round(score * 10) / 10, details, prompt };
}

// ── PICO extraction verification ────────────────────────────────────

export async function verifyPicoExtraction(
  results: UnifiedSearchResult[],
  query: string,
  targetPaper?: { titleFragment: string; expectedPico: Record<string, string> }
): Promise<{
  score: number;
  details: string[];
}> {
  const { buildExtractionPrompt, parseExtractionResponse } = await import("@/lib/research/extraction");

  const details: string[] = [];
  let checks = 0;
  let passed = 0;

  // Check papers with abstracts (prerequisite for extraction)
  const extractable = results.slice(0, 10).filter((r) => r.abstract && r.abstract.length > 50);
  checks++;
  if (extractable.length >= 7) {
    passed++;
    details.push(`✓ ${extractable.length}/10 top papers have abstracts (extractable)`);
  } else {
    details.push(`✗ Only ${extractable.length}/10 top papers have abstracts`);
  }

  // Verify prompt construction for each extractable paper
  checks++;
  let validPrompts = 0;
  for (const r of extractable.slice(0, 5)) {
    const prompt = buildExtractionPrompt({
      title: r.title,
      abstractText: r.abstract!,
      userQuery: query,
    });
    if (prompt.system && prompt.user && prompt.user.includes(r.title)) {
      validPrompts++;
    }
  }
  const promptRatio = validPrompts / Math.min(5, extractable.length);
  if (promptRatio >= 0.8) {
    passed++;
    details.push(`✓ ${validPrompts} valid extraction prompts built`);
  } else {
    details.push(`✗ Only ${validPrompts} valid extraction prompts`);
  }

  // Verify parseExtractionResponse handles valid JSON
  checks++;
  const sampleResponse = JSON.stringify({
    summary: "Test summary",
    fields: {
      population: { value: "HFrEF patients", source: "quote" },
      intervention: { value: "Dapagliflozin 10mg", source: "quote" },
      comparator: { value: "Placebo", source: "quote" },
      primaryOutcome: { value: "CV death or HF hospitalization", source: "quote" },
      effectSize: { value: "HR 0.74", source: "quote" },
      sampleSize: { value: "4744", source: "quote" },
      followUp: { value: "18.2 months", source: "quote" },
      studyDesign: { value: "RCT", source: "quote" },
      limitations: { value: "Not stated", source: "" },
    },
  });
  const parsed = parseExtractionResponse(sampleResponse);
  if (parsed && parsed.fields && parsed.fields.population) {
    passed++;
    details.push("✓ parseExtractionResponse correctly parses PICO JSON");
  } else {
    details.push("✗ parseExtractionResponse failed on valid JSON");
  }

  // Verify it handles code-fenced JSON
  checks++;
  const fencedResponse = "```json\n" + sampleResponse + "\n```";
  const parsedFenced = parseExtractionResponse(fencedResponse);
  if (parsedFenced && parsedFenced.fields) {
    passed++;
    details.push("✓ parseExtractionResponse handles code-fenced JSON");
  } else {
    details.push("✗ parseExtractionResponse failed on code-fenced JSON");
  }

  // If target paper specified, verify it's in results
  if (targetPaper) {
    checks++;
    const found = results.find((r) =>
      r.title.toLowerCase().includes(targetPaper.titleFragment.toLowerCase())
    );
    if (found) {
      passed++;
      details.push(`✓ Target paper "${targetPaper.titleFragment}" found in results`);
    } else {
      details.push(`✗ Target paper "${targetPaper.titleFragment}" not found`);
    }
  }

  const score = (passed / checks) * 10;
  return { score: Math.round(score * 10) / 10, details };
}

// ── Per-source analysis (for reporting) ─────────────────────────────

export function analyzePerSource(
  runResult: RunResult
): Record<string, { count: number; withDoi: number; withAbstract: number; evidenceLevels: Record<string, number> }> {
  const analysis: Record<string, { count: number; withDoi: number; withAbstract: number; evidenceLevels: Record<string, number> }> = {};

  for (const [name, data] of Object.entries(runResult.perSource)) {
    if (!data) continue; // clinicalTrials may be undefined
    const results = data.results;
    const levels: Record<string, number> = {};
    let withDoi = 0;
    let withAbstract = 0;

    for (const r of results) {
      if (r.doi) withDoi++;
      if (r.abstract) withAbstract++;
      const lvl = r.evidenceLevel || "V";
      levels[lvl] = (levels[lvl] || 0) + 1;
    }

    analysis[name] = {
      count: results.length,
      withDoi,
      withAbstract,
      evidenceLevels: levels,
    };
  }

  return analysis;
}
