/**
 * Trial-lookup ranking: prefer the PRIMARY trial report.
 *
 * When the user looks up a specific trial ("DAPA-HF trial", "PARTNER 3 trial",
 * "SPRINT trial …"), the canonical answer is the trial's primary results paper —
 * not a meta-analysis OF the trial, nor one of its sub-studies / follow-ups /
 * design papers, which routinely out-rank the primary on citations or recency.
 *
 * `demoteSecondaryTrialResults` STABLY moves high-confidence secondary literature
 * below everything else, so the primary report rises. Because the primary is never
 * itself classified as secondary, this can only raise (never lower) its position —
 * a provably safe transform for trial-lookup queries. Applied ONLY when the query
 * planner flagged a trial lookup.
 */

interface TrialResultLike {
  title?: string;
  studyType?: string;
}

// High-confidence markers that a paper is secondary literature ABOUT a trial
// rather than the trial's own primary report. Deliberately conservative: only
// unambiguous sub-study / design / pooled markers (NOT generic "effect of … on …"
// phrasings, which many primary RCT titles legitimately use).
const SECONDARY_TITLE_MARKERS =
  /\b(according to|findings from|post[\s-]?hoc|sub[\s-]?stud(?:y|ies)|sub[\s-]?analys[ei]s|subgroup|secondary analys[ei]s|pooled analys[ei]s|individual patient data|rationale and design|design and rationale|baseline characteristics|eligible participants|echocardiographic|economic outcomes?|cost[\s-]?effectiveness|quality of life|health status|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)[\s-]years?\b|registry)\b/i;

/** True when a result is a meta-analysis/SR of, or a sub-study/follow-up of, a trial. */
export function isSecondaryTrialResult(r: TrialResultLike): boolean {
  if (r.studyType === "meta_analysis" || r.studyType === "systematic_review") return true;
  return SECONDARY_TITLE_MARKERS.test(r.title ?? "");
}

/**
 * Stable partition: primary literature first (original order preserved), then
 * secondary literature (original order preserved). Returns the SAME array
 * reference when there is no secondary literature to move.
 */
export function demoteSecondaryTrialResults<T extends TrialResultLike>(results: T[]): T[] {
  const primary: T[] = [];
  const secondary: T[] = [];
  for (const r of results) {
    if (isSecondaryTrialResult(r)) secondary.push(r);
    else primary.push(r);
  }
  return secondary.length ? [...primary, ...secondary] : results;
}
