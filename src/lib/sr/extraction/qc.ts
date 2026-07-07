// ─────────────────────────────────────────────────────────────────────────────
// QC sampling (non-negotiable #9). Agreement ≠ accuracy: two reviewers can share
// a misread. So a fraction (default 20%, a per-review setting) of AGREED CRITICAL
// fields is sampled for a source-verified re-check. This is framed as "N fields
// to verify" — NEVER "drive conflicts to 0" (the framing rule that avoids
// automation-bias-adjacent closure pressure).
//
// Selection is DETERMINISTIC (a stable hash of study+field), not random: the same
// review always samples the same fields, so a QC re-check is reproducible and the
// count never flickers between renders.
// ─────────────────────────────────────────────────────────────────────────────

// A small, stable string hash (FNV-1a). Deterministic across runs — we cannot use
// Math.random here (reproducibility + the workflow-runtime ban on it).
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface QcCandidate {
  studyId: string;
  fieldId: string;
}

// Clamp a raw rate to [0, 1]. A rate of 0 samples nothing; 1 samples everything.
export function normalizeRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rate >= 1) return 1;
  return rate;
}

// Deterministically decide whether ONE agreed critical field is in the QC sample.
// A field is sampled when its stable hash falls in the lowest `rate` fraction of
// the hash space. Same (study, field, rate) → same answer, every time.
export function isQcSampled(candidate: QcCandidate, rate: number): boolean {
  const r = normalizeRate(rate);
  if (r <= 0) return false;
  if (r >= 1) return true;
  const bucket = hash(`${candidate.studyId}:${candidate.fieldId}`) / 0xffffffff;
  return bucket < r;
}

// The set of agreed critical fields selected for a QC re-check across a review.
export function selectQcSample(
  candidates: readonly QcCandidate[],
  rate: number,
): QcCandidate[] {
  return candidates.filter((c) => isQcSampled(c, rate));
}
