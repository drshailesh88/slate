import type { DraftSentence, ReportViewDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The grounding gate — PURE. The report's anti-hallucination contract:
//
//   1. The draft model is handed a closed table of GroundingSources (the
//      review's own computed facts + numbered study references). It is the ONLY
//      material a draft may draw on.
//   2. Every drafted sentence must cite ≥1 known source key.
//   3. Every NUMBER in a drafted sentence must be supported by a cited source —
//      a numeric token that no cited source carries kills the sentence.
//
// Rejections are counted and surfaced (never silent), so "the model made up a
// number" is a visible, testable failure mode — not prose that slips through.
// ─────────────────────────────────────────────────────────────────────────────

export interface GroundingSource {
  /** Citation key a sentence uses: 'S1' (study) or 'C:<count key>' (number). */
  key: string;
  /** Chip label rendered for the citation. */
  label: string;
  /** The factual line the model may restate (numbers included). */
  description: string;
  /** Every numeric token this source supports. */
  allowedNumbers: number[];
}

// Numeric tokens: integers, decimals, thousands separators ("5,988"). A token
// like "95%" yields 95. A digit glued to a letter ("SGLT2", "RoB2") is part of
// an identifier, not a numeric claim, so it is not a token. Order preserved;
// duplicates kept.
export function extractNumericTokens(text: string): number[] {
  const matches = text.match(/(?<![A-Za-z0-9])\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
  return matches.map((token) => Number.parseFloat(token.replace(/,/g, '')));
}

export type SentenceRejection =
  'no_citation' | 'unknown_citation' | 'ungrounded_number';

export function validateSentence(
  sentence: DraftSentence,
  sourcesByKey: ReadonlyMap<string, GroundingSource>,
): { ok: true } | { ok: false; reason: SentenceRejection } {
  if (sentence.citationKeys.length === 0) {
    return { ok: false, reason: 'no_citation' };
  }
  const cited: GroundingSource[] = [];
  for (const key of sentence.citationKeys) {
    const source = sourcesByKey.get(key);
    if (!source) return { ok: false, reason: 'unknown_citation' };
    cited.push(source);
  }

  const allowed = new Set(cited.flatMap((s) => s.allowedNumbers));
  for (const token of extractNumericTokens(sentence.text)) {
    if (!allowed.has(token)) return { ok: false, reason: 'ungrounded_number' };
  }
  return { ok: true };
}

export function filterGroundedSentences(
  sentences: readonly DraftSentence[],
  sources: readonly GroundingSource[],
): { kept: DraftSentence[]; dropped: number } {
  const byKey = new Map(sources.map((s) => [s.key, s]));
  const kept = sentences.filter((s) => validateSentence(s, byKey).ok);
  return { kept, dropped: sentences.length - kept.length };
}

// ── Building the grounding table from the (already chokepoint-safe) view ─────

function numbersIn(value: string | null): number[] {
  return value ? extractNumericTokens(value) : [];
}

/**
 * The closed source table for a draft run. Built from the SERVER-computed view
 * only — during `independent` the withheld sections contribute nothing, so a
 * draft physically cannot cite (or number-drop) a blinded aggregate.
 */
export function buildGroundingSources(view: ReportViewDTO): GroundingSource[] {
  const sources: GroundingSource[] = [];

  for (const count of view.counts) {
    sources.push({
      key: `C:${count.key}`,
      label: count.label,
      description: `${count.label}: ${count.value}`,
      allowedNumbers: [count.value],
    });
  }

  if (view.screening.status === 'available') {
    for (const reason of view.screening.excludeReasons) {
      sources.push({
        key: `C:excluded.${reason.label}`,
        label: `Excluded — ${reason.label}`,
        description: `Records excluded for "${reason.label}": ${reason.count}`,
        allowedNumbers: [reason.count],
      });
    }
  }

  if (view.rob.status === 'available') {
    for (const bucket of view.rob.distribution) {
      sources.push({
        key: `C:rob.${bucket.outcome}`,
        label: `Risk of bias — ${bucket.label}`,
        description: `Studies at "${bucket.label}" risk of bias: ${bucket.count}`,
        allowedNumbers: [bucket.count],
      });
    }
  }

  const characteristicsByKey = new Map(
    view.characteristics.map((row) => [row.citationKey, row]),
  );
  for (const ref of view.references) {
    const row = characteristicsByKey.get(ref.citationKey);
    const cellNumbers = row
      ? [
          ...numbersIn(row.design.value),
          ...numbersIn(row.population.value),
          ...numbersIn(row.sampleSize.value),
          ...numbersIn(row.primaryOutcome.value),
        ]
      : [];
    const facts = row
      ? [
          row.design.value ? `design: ${row.design.value}` : null,
          row.population.value ? `population: ${row.population.value}` : null,
          row.sampleSize.value ? `n = ${row.sampleSize.value}` : null,
          row.primaryOutcome.value
            ? `primary outcome: ${row.primaryOutcome.value}`
            : null,
        ].filter((f): f is string => f !== null)
      : [];
    sources.push({
      key: ref.citationKey,
      label: ref.label,
      description:
        `[${ref.n}] ${ref.label} — ${ref.title}` +
        (facts.length > 0 ? ` (${facts.join('; ')})` : ''),
      allowedNumbers: [
        ...(ref.year !== null ? [ref.year] : []),
        ref.n,
        ...cellNumbers,
      ],
    });
  }

  return sources;
}
