import type { UnifiedSearchResult } from "@/types/search";
import type {
  SearchTestCase,
  DimensionScores,
  ScoreDetail,
  MetadataCheck,
  RankingRule,
} from "./types";
import { normalizeTitle } from "@/lib/search/dedup";

// ── Helpers ─────────────────────────────────────────────────────────

function titleContains(
  result: UnifiedSearchResult,
  fragment: string
): boolean {
  const normalizedResult = normalizeTitle(result.title);
  const normalizedFragment = fragment
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
  return normalizedResult.includes(normalizedFragment);
}

function authorContains(
  result: UnifiedSearchResult,
  fragment: string
): boolean {
  const lowerFrag = fragment.toLowerCase();
  return result.authors.some((a) => a.toLowerCase().includes(lowerFrag));
}

/** Check if a result is "relevant" to the query using keyword overlap */
function isRelevantToQuery(
  result: UnifiedSearchResult,
  query: string
): boolean {
  // Extract meaningful keywords from the query (3+ chars, not stopwords)
  const stopwords = new Set([
    "the", "are", "what", "how", "does", "and", "for", "with",
    "from", "this", "that", "have", "been", "were", "was", "its",
    "can", "may", "not", "but", "all", "any", "each", "which",
    "their", "them", "than", "these", "those", "when", "will",
    "into", "over", "some", "could", "would", "should", "about",
    "between", "through",
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));

  if (keywords.length === 0) return true; // Can't assess — assume relevant

  // Check title + abstract + tldr for keyword overlap
  const text = [
    result.title,
    result.abstract || "",
    result.tldr || "",
  ]
    .join(" ")
    .toLowerCase();

  const matchCount = keywords.filter((kw) => text.includes(kw)).length;
  const ratio = matchCount / keywords.length;

  // At least 40% of query keywords must appear in the paper text
  return ratio >= 0.4;
}

// ── Recall ──────────────────────────────────────────────────────────

export function scoreRecall(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): ScoreDetail {
  const mustFindPapers = testCase.expectedPapers.filter((p) => p.mustFind);
  const details: string[] = [];
  let found = 0;

  for (const expected of mustFindPapers) {
    const match = results.find((r) => {
      const titleMatch = titleContains(r, expected.titleFragment);
      const authorMatch = expected.authorFragment
        ? authorContains(r, expected.authorFragment)
        : true;
      const yearMatch = expected.year
        ? Math.abs(r.year - expected.year) <= 1
        : true;
      return titleMatch && authorMatch && yearMatch;
    });

    if (match) {
      found++;
      details.push(
        `✓ FOUND "${expected.titleFragment}" → "${match.title}" (rank ${results.indexOf(match) + 1}, sources: ${match.sources.join(",")})`
      );
    } else {
      details.push(`✗ MISSING "${expected.titleFragment}"`);
    }
  }

  // Also check nice-to-have papers
  const niceToHave = testCase.expectedPapers.filter((p) => !p.mustFind);
  for (const expected of niceToHave) {
    const match = results.find((r) => titleContains(r, expected.titleFragment));
    details.push(
      match
        ? `○ BONUS "${expected.titleFragment}" found`
        : `○ BONUS "${expected.titleFragment}" not found`
    );
  }

  const score =
    mustFindPapers.length > 0
      ? (found / mustFindPapers.length) * 10
      : 10;

  return {
    dimension: "recall",
    score: Math.round(score * 10) / 10,
    maxScore: 10,
    details,
  };
}

// ── Precision ───────────────────────────────────────────────────────

export function scorePrecision(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): ScoreDetail {
  const top10 = results.slice(0, 10);
  const details: string[] = [];
  let relevant = 0;

  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    const isExpected = testCase.expectedPapers.some((ep) =>
      titleContains(r, ep.titleFragment)
    );
    const precisionQuery = testCase.precisionKeywords
      ? testCase.precisionKeywords.join(" ")
      : testCase.query;
    const isRelevant = isExpected || isRelevantToQuery(r, precisionQuery);

    if (isRelevant) {
      relevant++;
      details.push(
        `  #${i + 1} ✓ "${r.title.slice(0, 80)}..." [${r.evidenceLevel || "?"}, ${r.sources.join(",")}]`
      );
    } else {
      details.push(
        `  #${i + 1} ✗ "${r.title.slice(0, 80)}..." [${r.evidenceLevel || "?"}, ${r.sources.join(",")}] — off-topic`
      );
    }
  }

  const score = top10.length > 0 ? (relevant / top10.length) * 10 : 0;

  details.unshift(`${relevant}/${top10.length} top-10 results are relevant`);

  return {
    dimension: "precision",
    score: Math.round(score * 10) / 10,
    maxScore: 10,
    details,
  };
}

// ── Ranking ─────────────────────────────────────────────────────────

function checkRankingRule(
  results: UnifiedSearchResult[],
  rule: RankingRule
): { passed: boolean; detail: string } {
  const params = rule.params;

  switch (rule.check) {
    case "topN_evidence_order": {
      const n = (params.n as number) || 10;
      const higherLevel = params.higherLevel as string;
      const lowerLevel = params.lowerLevel as string;
      const topN = results.slice(0, n);
      const higherCount = topN.filter(
        (r) => r.evidenceLevel === higherLevel
      ).length;
      const lowerCount = topN.filter(
        (r) => r.evidenceLevel === lowerLevel
      ).length;
      const passed = higherCount >= lowerCount;
      return {
        passed,
        detail: `Top-${n}: Level ${higherLevel} count=${higherCount} vs Level ${lowerLevel} count=${lowerCount} → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    case "specific_paper_in_top_k": {
      const k = (params.k as number) || 5;
      const fragment = params.titleFragment as string;
      const topK = results.slice(0, k);
      const found = topK.some((r) => titleContains(r, fragment));
      return {
        passed: found,
        detail: `"${fragment}" in top ${k}: ${found ? "PASS" : "FAIL"}`,
      };
    }

    case "higher_level_outnumbers_lower": {
      const n = (params.n as number) || 10;
      const topN = results.slice(0, n);
      const levelOrder = ["I", "II", "III", "IV", "V"];
      const highEvidence = topN.filter(
        (r) =>
          r.evidenceLevel &&
          levelOrder.indexOf(r.evidenceLevel) <= 1 // I or II
      ).length;
      const lowEvidence = topN.filter(
        (r) =>
          r.evidenceLevel &&
          levelOrder.indexOf(r.evidenceLevel) >= 3 // IV or V
      ).length;
      const passed = highEvidence >= lowEvidence;
      return {
        passed,
        detail: `Top-${n}: High evidence (I-II)=${highEvidence} vs Low (IV-V)=${lowEvidence} → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    case "has_clinical_trials": {
      // Verify that clinical trial registrations are in the results
      const minTrials = (params.minTrials as number) || 1;
      const trials = results.filter((r) => r.nctId);
      const passed = trials.length >= minTrials;
      return {
        passed,
        detail: `Clinical trials found: ${trials.length} (need ≥${minTrials}) → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    case "has_nctId_fields": {
      // Verify that trial results have proper metadata
      const trials = results.filter((r) => r.nctId);
      if (trials.length === 0) {
        return { passed: false, detail: "No clinical trials in results → FAIL" };
      }
      const withStatus = trials.filter((r) => r.trialStatus).length;
      const withPhase = trials.filter((r) => r.trialPhase).length;
      const ratio = (withStatus + withPhase) / (trials.length * 2);
      const passed = ratio >= 0.5;
      return {
        passed,
        detail: `Trials: ${trials.length}, with status: ${withStatus}, with phase: ${withPhase} (field fill ${(ratio * 100).toFixed(0)}%) → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    case "overlap_with_expected": {
      // For benchmark: check how many expected papers appear in results
      const expectedFragments = (params.expectedFragments as string[]) || [];
      const threshold = (params.threshold as number) || 0.5;
      if (expectedFragments.length === 0) {
        return { passed: true, detail: "No expected fragments — PASS" };
      }
      const found = expectedFragments.filter((frag) =>
        results.some((r) => titleContains(r, frag))
      ).length;
      const ratio = found / expectedFragments.length;
      const passed = ratio >= threshold;
      return {
        passed,
        detail: `Overlap: ${found}/${expectedFragments.length} (${(ratio * 100).toFixed(0)}%) vs threshold ${(threshold * 100).toFixed(0)}% → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    case "majority_on_topic": {
      // For sparse topics: check that most top-N results contain at least one keyword
      const n = (params.n as number) || 10;
      const keywords = (params.keywords as string[]) || [];
      const threshold = (params.threshold as number) || 0.6;
      const topN = results.slice(0, Math.min(n, results.length));
      const onTopic = topN.filter((r) => {
        const text = (r.title + " " + (r.abstract || "")).toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      }).length;
      const ratio = topN.length > 0 ? onTopic / topN.length : 0;
      const passed = ratio >= threshold;
      return {
        passed,
        detail: `Top-${n}: ${onTopic}/${topN.length} on-topic (${(ratio * 100).toFixed(0)}%) vs threshold ${(threshold * 100).toFixed(0)}% → ${passed ? "PASS" : "FAIL"}`,
      };
    }

    default:
      return { passed: false, detail: `Unknown rule check: ${rule.check}` };
  }
}

export function scoreRanking(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): ScoreDetail {
  const rules = testCase.rankingRules;
  if (rules.length === 0) {
    return {
      dimension: "ranking",
      score: 5,
      maxScore: 10,
      details: ["No ranking rules defined — default score 5"],
    };
  }

  const details: string[] = [];
  let passed = 0;

  for (const rule of rules) {
    const result = checkRankingRule(results, rule);
    details.push(`${result.passed ? "✓" : "✗"} ${rule.rule}: ${result.detail}`);
    if (result.passed) passed++;
  }

  const score = (passed / rules.length) * 10;

  return {
    dimension: "ranking",
    score: Math.round(score * 10) / 10,
    maxScore: 10,
    details,
  };
}

// ── Metadata ────────────────────────────────────────────────────────

function checkMetadata(
  results: UnifiedSearchResult[],
  check: MetadataCheck
): { ratio: number; detail: string } {
  if (results.length === 0) {
    return { ratio: 0, detail: `${check.check}: no results to check` };
  }

  let passing = 0;

  for (const r of results) {
    switch (check.check) {
      case "all_have_doi":
        if (r.doi && r.doi.length > 0) passing++;
        break;
      case "study_type_not_other":
        if (r.studyType && r.studyType !== "other") passing++;
        break;
      case "year_nonzero":
        if (r.year && r.year > 0) passing++;
        break;
      case "has_abstract":
        if (r.abstract && r.abstract.length > 0) passing++;
        break;
      case "has_authors":
        if (r.authors && r.authors.length > 0) passing++;
        break;
    }
  }

  const ratio = passing / results.length;
  const passed = ratio >= check.threshold;

  return {
    ratio,
    detail: `${check.check}: ${passing}/${results.length} (${(ratio * 100).toFixed(0)}%) — threshold ${(check.threshold * 100).toFixed(0)}% → ${passed ? "PASS" : "FAIL"}`,
  };
}

export function scoreMetadata(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): ScoreDetail {
  const checks = testCase.metadataChecks;
  if (checks.length === 0) {
    return {
      dimension: "metadata",
      score: 5,
      maxScore: 10,
      details: ["No metadata checks defined — default score 5"],
    };
  }

  const details: string[] = [];
  let totalRatio = 0;

  for (const check of checks) {
    const result = checkMetadata(results, check);
    details.push(result.detail);
    totalRatio += result.ratio;
  }

  const avgRatio = totalRatio / checks.length;
  const score = avgRatio * 10;

  return {
    dimension: "metadata",
    score: Math.round(score * 10) / 10,
    maxScore: 10,
    details,
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

export function scoreDedup(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): ScoreDetail {
  const checks = testCase.dedupChecks;
  if (checks.length === 0) {
    return {
      dimension: "dedup",
      score: 5,
      maxScore: 10,
      details: ["No dedup checks defined — default score 5"],
    };
  }

  const details: string[] = [];
  let passed = 0;

  for (const check of checks) {
    for (const fragment of check.titleFragments) {
      const matches = results.filter((r) => titleContains(r, fragment));
      const ok = matches.length <= check.maxOccurrences;

      if (ok) {
        passed++;
        details.push(
          `✓ "${fragment}": ${matches.length} occurrence(s) ≤ ${check.maxOccurrences}`
        );
      } else {
        details.push(
          `✗ "${fragment}": ${matches.length} occurrence(s) > ${check.maxOccurrences}`
        );
        // List the duplicates
        for (const m of matches) {
          details.push(
            `    ↳ "${m.title.slice(0, 80)}" [${m.sources.join(",")}] doi=${m.doi || "?"}`
          );
        }
      }
    }
  }

  const totalChecks = checks.reduce(
    (sum, c) => sum + c.titleFragments.length,
    0
  );
  const score = totalChecks > 0 ? (passed / totalChecks) * 10 : 5;

  return {
    dimension: "dedup",
    score: Math.round(score * 10) / 10,
    maxScore: 10,
    details,
  };
}

// ── Composite ───────────────────────────────────────────────────────

const WEIGHTS: Record<keyof DimensionScores, number> = {
  recall: 0.25,
  precision: 0.2,
  ranking: 0.25,
  metadata: 0.15,
  dedup: 0.15,
};

export function computeWeightedScore(scores: DimensionScores): number {
  let weighted = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    weighted += scores[key as keyof DimensionScores] * weight;
  }
  return Math.round(weighted * 10) / 10;
}

export function scoreAll(
  results: UnifiedSearchResult[],
  testCase: SearchTestCase
): {
  scores: DimensionScores;
  weighted: number;
  pass: boolean;
  details: ScoreDetail[];
} {
  const recallDetail = scoreRecall(results, testCase);
  const precisionDetail = scorePrecision(results, testCase);
  const rankingDetail = scoreRanking(results, testCase);
  const metadataDetail = scoreMetadata(results, testCase);
  const dedupDetail = scoreDedup(results, testCase);

  const scores: DimensionScores = {
    recall: recallDetail.score,
    precision: precisionDetail.score,
    ranking: rankingDetail.score,
    metadata: metadataDetail.score,
    dedup: dedupDetail.score,
  };

  const weighted = computeWeightedScore(scores);

  return {
    scores,
    weighted,
    pass: weighted >= 7.0,
    details: [
      recallDetail,
      precisionDetail,
      rankingDetail,
      metadataDetail,
      dedupDetail,
    ],
  };
}
