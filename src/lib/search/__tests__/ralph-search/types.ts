import type { UnifiedSearchResult } from "@/types/search";

// ── Test case definition ────────────────────────────────────────────

export interface ExpectedPaper {
  /** Substring to match against normalized titles */
  titleFragment: string;
  /** Optional substring match against author list */
  authorFragment?: string;
  /** Expected publication year */
  year?: number;
  /** If true, failing to find this paper reduces recall score */
  mustFind: boolean;
}

export interface RankingRule {
  /** Human-readable description of the rule */
  rule: string;
  /** Type of check to perform */
  check:
    | "topN_evidence_order"
    | "specific_paper_in_top_k"
    | "higher_level_outnumbers_lower"
    | "majority_on_topic"
    | "has_clinical_trials"
    | "has_nctId_fields"
    | "overlap_with_expected";
  /** Parameters for the check */
  params: Record<string, unknown>;
}

export interface MetadataCheck {
  /** Type of check */
  check:
    | "all_have_doi"
    | "study_type_not_other"
    | "year_nonzero"
    | "has_abstract"
    | "has_authors";
  /** Fraction of results that must pass (0-1) */
  threshold: number;
}

export interface DedupCheck {
  /** Title fragments that should be deduped */
  titleFragments: string[];
  /** Maximum occurrences allowed */
  maxOccurrences: number;
}

export interface RedTeamVariant {
  name: string;
  query: string;
  expectation: string;
  failurePattern: string;
}

export interface SearchTestCase {
  id: string;
  name: string;
  phase: number;
  category: string;
  query: string;
  expectedPapers: ExpectedPaper[];
  rankingRules: RankingRule[];
  metadataChecks: MetadataCheck[];
  dedupChecks: DedupCheck[];
  redTeam?: RedTeamVariant[];
  /** Optional broader keywords for precision evaluation (sparse/narrow queries) */
  precisionKeywords?: string[];
}

// ── Scoring ─────────────────────────────────────────────────────────

export interface DimensionScores {
  recall: number;
  precision: number;
  ranking: number;
  metadata: number;
  dedup: number;
}

export interface ScoreDetail {
  dimension: string;
  score: number;
  maxScore: number;
  details: string[];
}

export interface CycleResult {
  id: string;
  name: string;
  phase: number;
  scores: DimensionScores;
  weighted: number;
  pass: boolean;
  scoreDetails: ScoreDetail[];
  patchesApplied: string[];
  regressionResults: string;
  perSourceCounts: {
    pubmed: number;
    semanticScholar: number;
    openAlex: number;
  };
  fusedCount: number;
  dedupedCount: number;
  timestamp: string;
}

// ── Scorecard ───────────────────────────────────────────────────────

export interface Scorecard {
  cycles: CycleResult[];
  phaseAverages: { phase1: number; phase2: number; phase3: number };
  totalPassing: number;
  totalFailing: number;
}

// ── Runner config ───────────────────────────────────────────────────

export interface RunnerConfig {
  /** Run live API calls (true) or use cached results (false) */
  live: boolean;
  /** Directory to cache/read results */
  cacheDir: string;
  /** The search query */
  query: string;
  /** Max results per source */
  maxPerSource: number;
}

// ── Cached results ──────────────────────────────────────────────────

export interface CachedSourceResults {
  source: string;
  query: string;
  timestamp: string;
  results: UnifiedSearchResult[];
  total: number;
}
