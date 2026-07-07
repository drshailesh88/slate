/**
 * Off-entity drift demotion.
 *
 * The cross-encoder reranker scores a result on topical similarity, so it cannot
 * reliably tell that a paper about a DIFFERENT clinical subtype (HFpEF when the
 * query asked for HFrEF) or a DIFFERENT specific drug (tirzepatide when the query
 * named semaglutide) is the wrong answer — those papers share most surface terms
 * and ride high citation/journal priors into the top-10. This module supplies a
 * gentle, multiplicative penalty for that drift so the ranker can demote (never
 * drop) the off-entity result.
 *
 * It is deliberately CONSERVATIVE and TABLE-DRIVEN (no per-query hacks):
 *  - It only fires when the query unambiguously specifies ONE side of a known
 *    contrast (one EF subtype, one prevention setting) or ONE specific drug of a
 *    class — never for comparison queries (which name two members) or class-level
 *    queries (which name the class, not a member).
 *  - A result that covers the queried entity, or is a class-level review, is never
 *    penalized.
 *
 * Returns a multiplier in (0, 1]; 1 means "no drift detected".
 */

interface ContrastMember {
  name: string;
  re: RegExp;
}
interface ContrastGroup {
  label: string;
  members: ContrastMember[];
}

// Mutually-exclusive clinical subtypes / settings. A query naming exactly one
// member, and a result whose title names a DIFFERENT member (and not the queried
// one), is off-subtype drift.
const CONTRAST_GROUPS: ContrastGroup[] = [
  {
    label: "ejection-fraction-subtype",
    members: [
      { name: "reduced", re: /(reduced ejection fraction|hfref)/i },
      { name: "preserved", re: /(preserved ejection fraction|hfpef)/i },
      { name: "mid-range", re: /(mid-?range ejection fraction|hfmref)/i },
    ],
  },
  {
    label: "prevention-setting",
    members: [
      { name: "primary", re: /\bprimary prevention\b/i },
      { name: "secondary", re: /\bsecondary prevention\b/i },
    ],
  },
  {
    // Proximity (not adjacency) so "conservative versus liberal oxygen" registers
    // BOTH members → recognized as a comparison → no demotion fires.
    label: "oxygen-strategy",
    members: [
      {
        name: "conservative",
        re: /conservative.{0,30}\b(?:oxygen|o2)\b|\b(?:oxygen|o2)\b.{0,30}conservative/i,
      },
      {
        name: "liberal",
        re: /liberal.{0,30}\b(?:oxygen|o2)\b|\b(?:oxygen|o2)\b.{0,30}liberal/i,
      },
    ],
  },
];

interface DrugClass {
  className: RegExp;
  drugs: { name: string; re: RegExp }[];
}

// Specific drugs grouped by class. A query naming exactly one of these (and not
// the class name, and not a comparison), with a result title about a DIFFERENT
// drug of the same class (and not the class), is off-drug drift.
const DRUG_CLASSES: DrugClass[] = [
  {
    className: /\bglp-?1\b|glucagon-like peptide|incretin/i,
    drugs: [
      { name: "semaglutide", re: /\bsemaglutide\b/i },
      { name: "liraglutide", re: /\bliraglutide\b/i },
      { name: "dulaglutide", re: /\bdulaglutide\b/i },
      { name: "exenatide", re: /\bexenatide\b/i },
      { name: "lixisenatide", re: /\blixisenatide\b/i },
      { name: "albiglutide", re: /\balbiglutide\b/i },
      { name: "tirzepatide", re: /\btirzepatide\b/i },
    ],
  },
  {
    className: /\bsglt-?2\b|gliflozin|sodium[- ]glucose/i,
    drugs: [
      { name: "empagliflozin", re: /\bempagliflozin\b/i },
      { name: "dapagliflozin", re: /\bdapagliflozin\b/i },
      { name: "canagliflozin", re: /\bcanagliflozin\b/i },
      { name: "ertugliflozin", re: /\bertugliflozin\b/i },
      { name: "sotagliflozin", re: /\bsotagliflozin\b/i },
    ],
  },
  {
    className: /\bstatins?\b|hmg-?coa/i,
    drugs: [
      { name: "atorvastatin", re: /\batorvastatin\b/i },
      { name: "rosuvastatin", re: /\brosuvastatin\b/i },
      { name: "simvastatin", re: /\bsimvastatin\b/i },
      { name: "pravastatin", re: /\bpravastatin\b/i },
      { name: "lovastatin", re: /\blovastatin\b/i },
      { name: "pitavastatin", re: /\bpitavastatin\b/i },
      { name: "fluvastatin", re: /\bfluvastatin\b/i },
    ],
  },
];

const COMPARISON_RE = /\b(versus|vs\.?|compared (?:to|with)|head[- ]to[- ]head)\b/i;

// Specific adverse-event outcomes. When the QUERY asks about one of these, a result
// about a DIFFERENT (efficacy) outcome that never mentions the adverse event is
// off-outcome drift (e.g. a "cardiovascular outcomes" MA for a "pancreatitis" query).
const ADVERSE_OUTCOME_RE =
  /\b(pancreatitis|pancreatic cancer|ketoacidosis|\bdka\b|myocarditis|pericarditis|aneurysm|dissection|amputation|fractures?|thrombo(?:sis|embolism)?|embolism|h[ae]morrhage|bleeding|malignanc(?:y|ies)|carcinoma|gangrene|rhabdomyolysis|angioedema|hypoglyc[ae]mia|retinopathy|nephrolithiasis|cholelithiasis|gallstones?)\b/i;

// Efficacy / different-outcome markers in a RESULT title — the "wrong answer" shape
// for an adverse-event query. Phrased as outcome clauses to avoid over-matching.
const EFFICACY_OUTCOME_RE =
  /\b(cardiovascular (?:outcomes?|disease|death|mortality|events?)|all-cause mortality|kidney (?:outcomes?|disease)|renal outcomes?|glyc[ae]mic (?:control|outcomes?)|hba1c|weight (?:loss|reduction)|heart failure hospitali[sz]ation|major adverse cardiovascular)\b/i;

/** Demote a result about a different (efficacy) outcome than the adverse event the
 *  query asks about. Returns 1 unless the query is adverse-event-specific AND the
 *  result is off-outcome (efficacy markers, no coverage of the queried event). */
function outcomeDriftPenalty(query: string, title: string): number {
  const adverse = query.match(ADVERSE_OUTCOME_RE);
  if (!adverse) return 1; // not an adverse-event query — never fire (protects PICO/efficacy queries)
  // Coverage: the result mentions the SAME adverse outcome → not drift.
  if (new RegExp(`\\b${adverse[0]}`, "i").test(title)) return 1;
  return EFFICACY_OUTCOME_RE.test(title) ? OFFDRUG_PENALTY : 1;
}

/** Penalty when a result is about a different subtype than the query specifies. */
export const CONTRAST_PENALTY = 0.65;
/** Penalty when a result is about a different specific drug than the query names. */
export const OFFDRUG_PENALTY = 0.8;

function contrastPenalty(query: string, title: string): number {
  let factor = 1;
  for (const group of CONTRAST_GROUPS) {
    const queryMembers = group.members.filter((m) => m.re.test(query));
    if (queryMembers.length !== 1) continue; // 0 or ≥2 (comparison/ambiguous)
    const qMember = queryMembers[0];
    if (qMember.re.test(title)) continue; // title covers the queried subtype
    const otherInTitle = group.members.some((m) => m !== qMember && m.re.test(title));
    if (otherInTitle) factor *= CONTRAST_PENALTY;
  }
  return factor;
}

function offDrugPenalty(query: string, title: string): number {
  if (COMPARISON_RE.test(query)) return 1;
  let factor = 1;
  for (const cls of DRUG_CLASSES) {
    if (cls.className.test(query)) continue; // class-level query intent
    const queryDrugs = cls.drugs.filter((d) => d.re.test(query));
    if (queryDrugs.length !== 1) continue; // 0 or ≥2 named (comparison)
    const qDrug = queryDrugs[0];
    if (qDrug.re.test(title)) continue; // title mentions the queried drug
    if (cls.className.test(title)) continue; // class-level review — legitimately relevant
    const otherDrugInTitle = cls.drugs.some((d) => d !== qDrug && d.re.test(title));
    if (otherDrugInTitle) factor *= OFFDRUG_PENALTY;
  }
  return factor;
}

/**
 * Multiplicative demotion in (0, 1] for a result whose title is about a different
 * subtype or specific drug than the query specifies. 1 = no drift.
 */
export function entityDriftPenalty(
  query: string,
  result: { title?: string; abstract?: string }
): number {
  const title = (result.title ?? "").toLowerCase();
  if (!title.trim()) return 1;
  const q = query.toLowerCase();
  const factor =
    contrastPenalty(q, title) * offDrugPenalty(q, title) * outcomeDriftPenalty(q, title);
  return Math.min(1, Math.max(0.01, factor));
}
