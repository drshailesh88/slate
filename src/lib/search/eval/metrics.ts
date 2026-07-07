/**
 * Deterministic, ground-truth-aware metrics for the literature-search eval
 * harness. Pure functions only (no I/O) so they are unit tested by vitest and
 * reused by the runner in `eval/literature-search/`.
 *
 * Two families of metric:
 *  - Ground-truth metrics (need `mustHaves`): recall@k, best-must-have rank, MRR, nDCG@k.
 *  - Ground-truth-free metrics (always computable): DOI/PMID/year/journal fill rate,
 *    duplicate rate, case-report rate, lexical coverage.
 *
 * The LLM council supplies the *semantic* relevance judgment these heuristics
 * cannot (e.g. an on-topic-by-keywords case report that is clinically useless).
 */

export interface EvalResultItem {
  title: string;
  doi?: string;
  pmid?: string;
  year?: number;
  journal?: string;
  studyType?: string;
  abstract?: string;
}

export interface MustHaveSpec {
  label?: string;
  pmids?: string[];
  dois?: string[];
  titleIncludes?: string[];
}

const STOPWORDS = new Set([
  "the", "are", "what", "how", "does", "do", "and", "for", "with", "from",
  "this", "that", "have", "has", "been", "were", "was", "its", "can", "may",
  "not", "but", "all", "any", "each", "which", "their", "them", "than",
  "these", "those", "when", "will", "into", "over", "some", "could", "would",
  "should", "about", "between", "through", "versus", "vs", "compared", "compare",
  "effect", "effects", "outcome", "outcomes", "impact", "result", "results",
  "patients", "adults", "risk", "trial", "trials", "study", "studies", "latest",
  "newest", "recent", "year", "years", "six", "ten", "five",
]);

export function normalizeDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/\s+/g, "");
}

export function normalizeTitle(title: string | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinctive (non-stopword) keywords from a query, for lexical coverage. */
export function queryKeywords(query: string): string[] {
  return [
    ...new Set(
      normalizeTitle(query)
        .split(" ")
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    ),
  ];
}

/** Does a single result satisfy a single must-have (any-of its identifiers)? */
export function matchesMustHave(item: EvalResultItem, spec: MustHaveSpec): boolean {
  if (spec.pmids?.length && item.pmid && spec.pmids.includes(item.pmid.trim())) {
    return true;
  }
  if (spec.dois?.length) {
    const d = normalizeDoi(item.doi);
    if (d && spec.dois.some((x) => normalizeDoi(x) === d)) return true;
  }
  if (spec.titleIncludes?.length) {
    const t = normalizeTitle(item.title);
    // every titleIncludes group entry is OR; but multi-token entries must all
    // be present so e.g. ["dapagliflozin","chronic kidney"] requires both.
    if (
      spec.titleIncludes.some((needle) => {
        const tokens = normalizeTitle(needle).split(" ").filter(Boolean);
        return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
      })
    ) {
      return true;
    }
  }
  return false;
}

/** 1-based rank of the first result matching the given must-have, or null. */
export function firstMatchRank(
  results: EvalResultItem[],
  spec: MustHaveSpec
): number | null {
  for (let i = 0; i < results.length; i++) {
    if (matchesMustHave(results[i], spec)) return i + 1;
  }
  return null;
}

/** Fraction of must-haves present within the top-k results (null if none specified). */
export function recallAtK(
  results: EvalResultItem[],
  mustHaves: MustHaveSpec[] | undefined,
  k: number
): number | null {
  if (!mustHaves || mustHaves.length === 0) return null;
  const top = results.slice(0, k);
  const found = mustHaves.filter((m) => top.some((r) => matchesMustHave(r, m))).length;
  return found / mustHaves.length;
}

/** Best (smallest) rank across all must-haves, or null if none found. */
export function bestMustHaveRank(
  results: EvalResultItem[],
  mustHaves: MustHaveSpec[] | undefined
): number | null {
  if (!mustHaves || mustHaves.length === 0) return null;
  let best: number | null = null;
  for (const m of mustHaves) {
    const r = firstMatchRank(results, m);
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

/** Mean reciprocal rank over must-haves (0 if a must-have is missing). */
export function meanReciprocalRank(
  results: EvalResultItem[],
  mustHaves: MustHaveSpec[] | undefined
): number | null {
  if (!mustHaves || mustHaves.length === 0) return null;
  const sum = mustHaves.reduce((acc, m) => {
    const r = firstMatchRank(results, m);
    return acc + (r ? 1 / r : 0);
  }, 0);
  return sum / mustHaves.length;
}

/**
 * Binary-relevance nDCG@k against must-have ground truth. Each must-have
 * contributes relevance to at most ONE result (its first match within top-k),
 * so DCG can never exceed IDCG and the score is bounded in [0, 1]. This avoids
 * inflation when a `titleIncludes` matcher matches several papers.
 */
export function ndcgAtK(
  results: EvalResultItem[],
  mustHaves: MustHaveSpec[] | undefined,
  k: number
): number | null {
  if (!mustHaves || mustHaves.length === 0) return null;
  const top = results.slice(0, k);
  // Mark the first matching position for each must-have as relevant (dedup so
  // one position is credited to at most one must-have).
  const relevantPositions = new Set<number>();
  for (const m of mustHaves) {
    for (let i = 0; i < top.length; i++) {
      if (relevantPositions.has(i)) continue;
      if (matchesMustHave(top[i], m)) {
        relevantPositions.add(i);
        break;
      }
    }
  }
  let dcg = 0;
  for (const pos of relevantPositions) dcg += 1 / Math.log2(pos + 2);
  const numRelevant = relevantPositions.size;
  let idcg = 0;
  for (let i = 0; i < numRelevant; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function fillRate(results: EvalResultItem[], pick: (r: EvalResultItem) => unknown): number {
  if (results.length === 0) return 0;
  const filled = results.filter((r) => {
    const v = pick(r);
    return v !== undefined && v !== null && String(v).trim() !== "" && v !== 0;
  }).length;
  return filled / results.length;
}

export const doiFillRate = (r: EvalResultItem[]) => fillRate(r, (x) => x.doi);
export const pmidFillRate = (r: EvalResultItem[]) => fillRate(r, (x) => x.pmid);
export const yearFillRate = (r: EvalResultItem[]) => fillRate(r, (x) => x.year);
export const journalFillRate = (r: EvalResultItem[]) => fillRate(r, (x) => x.journal);

/** A dedup key for duplicate detection: DOI > PMID > normalized title+year. */
function dedupKey(item: EvalResultItem): string {
  const d = normalizeDoi(item.doi);
  if (d) return `doi:${d}`;
  if (item.pmid) return `pmid:${item.pmid.trim()}`;
  return `title:${normalizeTitle(item.title).slice(0, 120)}|${item.year ?? ""}`;
}

/** Fraction of results that duplicate an earlier result in the list. */
export function duplicateRate(results: EvalResultItem[]): number {
  if (results.length === 0) return 0;
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of results) {
    const key = dedupKey(r);
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes / results.length;
}

/** Fraction of top-k results classified as case reports (a noise signal for these queries). */
export function caseReportRate(results: EvalResultItem[], k = 10): number {
  const top = results.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((r) => r.studyType === "case_report").length / top.length;
}

/**
 * Mean fraction of distinctive query keywords appearing in each top-k result's
 * title+abstract. A weak, honest on-topic proxy (the council judges true relevance).
 */
export function lexicalCoverage(
  results: EvalResultItem[],
  query: string,
  k = 10
): number {
  const kws = queryKeywords(query);
  if (kws.length === 0) return 1;
  const top = results.slice(0, k);
  if (top.length === 0) return 0;
  const perResult = top.map((r) => {
    const text = `${normalizeTitle(r.title)} ${normalizeTitle(r.abstract ?? "")}`;
    const matched = kws.filter((kw) => text.includes(kw)).length;
    return matched / kws.length;
  });
  return perResult.reduce((a, b) => a + b, 0) / perResult.length;
}

export interface QueryMetrics {
  count: number;
  recallAt10: number | null;
  bestMustHaveRank: number | null;
  bestInTop3: boolean | null;
  mrr: number | null;
  ndcgAt10: number | null;
  doiFillRate: number;
  pmidFillRate: number;
  yearFillRate: number;
  journalFillRate: number;
  duplicateRate: number;
  caseReportRateTop10: number;
  lexicalCoverageTop10: number;
}

export function computeQueryMetrics(
  results: EvalResultItem[],
  opts: { mustHaves?: MustHaveSpec[]; query: string; k?: number }
): QueryMetrics {
  const k = opts.k ?? 10;
  const best = bestMustHaveRank(results, opts.mustHaves);
  return {
    count: results.length,
    recallAt10: recallAtK(results, opts.mustHaves, k),
    bestMustHaveRank: best,
    bestInTop3: opts.mustHaves?.length ? best !== null && best <= 3 : null,
    mrr: meanReciprocalRank(results, opts.mustHaves),
    ndcgAt10: ndcgAtK(results, opts.mustHaves, k),
    doiFillRate: doiFillRate(results),
    pmidFillRate: pmidFillRate(results),
    yearFillRate: yearFillRate(results),
    journalFillRate: journalFillRate(results),
    duplicateRate: duplicateRate(results),
    caseReportRateTop10: caseReportRate(results, k),
    lexicalCoverageTop10: lexicalCoverage(results, opts.query, k),
  };
}

/** Mean of a numeric field across query metrics, ignoring nulls. */
export function meanOf(
  rows: QueryMetrics[],
  pick: (m: QueryMetrics) => number | boolean | null
): number | null {
  const vals = rows
    .map(pick)
    .map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v))
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
