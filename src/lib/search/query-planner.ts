/**
 * Query planner — turns a free-text clinical question into a retrieval plan.
 *
 * Responsibilities (all deterministic, no network):
 *  - Detect recency intent  → choose PubMed sort (relevance vs date).
 *  - Simplify natural-language / PICO phrasing into a robust keyword query so
 *    PubMed's automatic term mapping does not return empty sets (a real failure
 *    mode for queries like "newest evidence on lecanemab for Alzheimer disease").
 *  - Detect trial acronyms / NCT ids → enable ClinicalTrials.gov linking and
 *    keep the acronym as a phrase so landmark trials surface.
 *  - Produce a synonym-expanded supplementary query (drug class → drug names).
 *
 * The orchestrator uses `pubmedPrimary` first and falls back to `pubmedFallback`
 * (the verbatim query) only if the primary returns nothing.
 */

import { expandQuery } from "./query-expander";

export interface QueryPlan {
  raw: string;
  /** Keyword-simplified PubMed query (primary). */
  pubmedPrimary: string;
  /**
   * Broadened core-topic query (temporal/outcome qualifiers stripped), run
   * ALONGSIDE the primary and unioned, so a seminal trial that matches the topic
   * but not the qualifiers ("six year outcomes") is still retrieved. Null when it
   * would not differ from the primary.
   */
  pubmedBroadened: string | null;
  /** Verbatim query, used as a fallback if the primary returns 0 results. */
  pubmedFallback: string;
  /**
   * Last-resort recall relaxation: the distinctive query tokens OR-ed together
   * (generic filler dropped). Used ONLY when primary + broadened + fallback all
   * return nothing, so an over-constrained AND-query (e.g. a multi-trial family
   * lookup) cannot produce an empty result set. "" when relaxation adds nothing.
   */
  pubmedRelaxed: string;
  /** True when the user wants the newest evidence (sort by date, not relevance). */
  recency: boolean;
  /** Detected trial acronyms / registry ids (e.g. "DAPA-HF", "PARTNER 3", "NCT02675114"). */
  trialAcronyms: string[];
  /** True when the query looks like a specific trial lookup. */
  isTrialLookup: boolean;
  /** True when ClinicalTrials.gov should also be queried. */
  wantsTrials: boolean;
  /** True when a web fallback (guidelines / grey literature / recency) is useful. */
  wantsWeb: boolean;
  /**
   * True when the query is asking for a clinical-practice guideline / consensus
   * statement (society or agency). Ranking floats the authoritative guideline
   * document — newest version first — to the top for these.
   */
  isGuidelineLookup: boolean;
  /** Drug-class → drug-name synonym query, or null. */
  supplementaryQuery: string | null;
}

const GUIDELINE_RE =
  /\b(guideline|guidance|recommendation|consensus statement|position statement|practice parameter|ACC\/AHA|ESC|KDIGO|NICE|USPSTF|IDSA|WHO)\b/i;

const RECENCY_RE =
  /\b(latest|newest|recent(?:ly)?|most recent|up[- ]to[- ]date|emerging|cutting[- ]edge|this year|202[4-9])\b/i;

// Filler / scaffolding to strip before sending to PubMed automatic term mapping.
const FILLER_PATTERNS: RegExp[] = [
  /\b(what (?:is|are)|how (?:does|do)|tell me about)\b/gi,
  /\b(the )?(latest|newest|most recent|recent|new)\b/gi,
  /\bevidence (?:on|for|about|regarding)\b/gi,
  /\b(?:recent )?(?:advances?|developments?|updates?) (?:in|on|for)\b/gi,
  /\b(?:role|use|effect|effects|impact|efficacy|safety) of\b/gi,
  /\bin (?:adults?|patients?|people|individuals|the elderly|children|critically ill(?: patients?)?|icu patients?|hospitalized patients?)\b/gi,
  /\b(?:does|do|is|are|can|should|could|would|will)\b/gi,
  /\b(?:compared (?:to|with)|versus|vs\.?)\b/gi,
  /\b(?:affect|improve|reduce|increase|decrease|prevent)\b/gi,
];

// NCT registry id, e.g. NCT02675114
const NCT_RE = /\bNCT\d{8}\b/gi;
// Hyphenated all-caps acronyms, e.g. DAPA-HF, EMPEROR-Reduced, KEYNOTE-189
const HYPHEN_ACRONYM_RE = /\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g;
// "NAME N" trial style, e.g. PARTNER 3, SYNTAX II
const NAMED_NUMBER_RE = /\b[A-Z]{3,}(?:\s(?:I{1,3}|\d{1,2}))\b/g;

function detectTrialAcronyms(raw: string): string[] {
  const found = new Set<string>();
  for (const re of [NCT_RE, HYPHEN_ACRONYM_RE, NAMED_NUMBER_RE]) {
    const matches = raw.match(re) ?? [];
    for (const m of matches) {
      // Skip obvious non-acronyms that slip past (e.g. "COVID-19", "SARS-CoV-2",
      // "type-2", "CAR-T", "B-cell") — those are concepts/biomarkers, not trials.
      if (
        /^(COVID-19|SARS-CoV-2|PD-L1|PD-1|SGLT-2|GLP-1|HER-2|HER2|TYPE-2|CAR-T|CAR-NK|T-CELL|B-CELL|NK-CELL|CTLA-4|IL-\d+|TNF-[A-Z]+|EGFR|ALK|BRAF|KRAS|BRCA-?\d?|PI3K|mTOR|mRNA|HLA-[A-Z0-9]+|NT-proBNP|HBA1C)$/i.test(
          m
        )
      ) {
        continue;
      }
      found.add(m.trim());
    }
  }
  return [...found];
}

export function simplifyForPubMed(raw: string): string {
  let q = ` ${raw} `;
  for (const re of FILLER_PATTERNS) q = q.replace(re, " ");
  q = q
    .replace(/[?.!,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return q.length >= 3 ? q : raw.trim();
}

// Temporal / generic-outcome qualifiers that narrow a query away from the
// seminal trial (which reports e.g. 1-year results, not "six year outcomes").
const QUALIFIER_PATTERNS: RegExp[] = [
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[- ]?year[s]?\b/gi,
  /\b(?:long|short|mid)[- ]?term\b/gi,
  /\bfollow[- ]?up\b/gi,
  /\boutcomes?\b/gi,
  /\bresults?\b/gi,
];

/**
 * Strip temporal/outcome qualifiers from a (already simplified) query to recover
 * the core intervention+population topic — used as a broadened companion query so
 * landmark trials matching the topic (but not the qualifiers) are retrieved.
 */
export function coreTopicQuery(simplified: string): string {
  let q = ` ${simplified} `;
  for (const re of QUALIFIER_PATTERNS) q = q.replace(re, " ");
  return q.replace(/\s+/g, " ").trim();
}


/**
 * Build a precise PubMed query for trial-acronym lookups. Bare acronyms get
 * mis-mapped by PubMed's automatic term mapping (e.g. "PARTNER" → MeSH "Sexual
 * Partners"), so we pin each acronym as an exact title/abstract phrase. NCT ids
 * are searched bare (PubMed indexes them as secondary source ids).
 */
export function buildTrialPubMedQuery(acronyms: string[], raw: string): string {
  const clauses = acronyms.map((a) =>
    /^NCT\d{8}$/i.test(a) ? a : `"${a}"[tiab]`
  );
  const acronymClause =
    clauses.length > 1 ? `(${clauses.join(" OR ")})` : clauses[0];

  // Topic = the query minus the acronyms and the word "trial", simplified.
  let topicSource = raw;
  for (const a of acronyms) topicSource = topicSource.split(a).join(" ");
  const topic = simplifyForPubMed(topicSource.replace(/\btrials?\b/gi, " "))
    .replace(/\s+/g, " ")
    .trim();

  return topic.length >= 3 ? `${acronymClause} AND (${topic})` : acronymClause;
}

// Generic clinical/scaffolding words that carry little retrieval signal — dropped
// from the OR-relaxation so it keeps only distinctive entities (drugs, trials,
// conditions). Kept small and conservative (never drops drug/trial/condition names).
const RELAX_FILLER = new Set([
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were",
  "does", "did", "can", "may", "not", "but", "all", "any", "its", "their",
  "than", "into", "over", "trial", "trials", "study", "studies", "outcome",
  "outcomes", "result", "results", "patient", "patients", "adults", "adult",
  "people", "therapy", "treatment", "disease", "large", "small", "effect",
  "effects", "impact", "risk", "management", "versus", "compared", "comparison",
  "efficacy", "safety", "use", "using", "role", "evidence", "recent", "latest",
  "newest", "review", "analysis",
]);

/**
 * Distinctive query tokens OR-ed together — a standard IR recall relaxation for
 * an over-constrained AND-query. Preserves original token form (so hyphenated
 * trial names like "EMPA-REG" survive) and drops generic filler. Returns "" when
 * fewer than two distinctive tokens remain (relaxation would add nothing).
 */
export function relaxedOrQuery(raw: string): string {
  const tokens = raw
    .replace(/[?.!,;:()]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !RELAX_FILLER.has(t.toLowerCase()));
  const seen = new Set<string>();
  const distinct = tokens.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return distinct.length >= 2 ? distinct.slice(0, 8).join(" OR ") : "";
}

export function planQuery(raw: string): QueryPlan {
  const trimmed = raw.trim();
  const trialAcronyms = detectTrialAcronyms(trimmed);
  const isTrialLookup =
    trialAcronyms.length > 0 || /\btrial\b/i.test(trimmed);
  const recency = RECENCY_RE.test(trimmed);

  const simplified = simplifyForPubMed(trimmed);
  const expansion = expandQuery(trimmed);
  const pubmedPrimary =
    trialAcronyms.length > 0
      ? buildTrialPubMedQuery(trialAcronyms, trimmed)
      : simplified;

  // Broaden only for non-acronym queries (acronym queries are already targeted).
  const core = trialAcronyms.length > 0 ? "" : coreTopicQuery(simplified);
  const pubmedBroadened =
    core && core !== simplified && core.split(" ").length >= 2 ? core : null;

  return {
    raw: trimmed,
    pubmedPrimary,
    pubmedBroadened,
    pubmedFallback: trimmed,
    pubmedRelaxed: relaxedOrQuery(trimmed),
    recency,
    trialAcronyms,
    isTrialLookup,
    // Query ClinicalTrials.gov for explicit trial lookups (acronym/NCT/"trial").
    wantsTrials: isTrialLookup,
    // Web fallback helps most for guideline lookups and recency-biased queries,
    // where the authoritative artifact often lives on a society/agency site.
    wantsWeb: GUIDELINE_RE.test(trimmed) || recency,
    isGuidelineLookup: GUIDELINE_RE.test(trimmed),
    supplementaryQuery: expansion.supplementary,
  };
}
