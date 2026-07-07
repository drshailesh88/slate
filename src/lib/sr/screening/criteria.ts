import type { ProtocolContent } from '@/lib/sr/protocol/types';
import type {
  HighlightTermsDTO,
  ScreeningCriteriaDTO,
  ScreeningCriterionDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Derive the screening criteria checklist + abstract highlight terms from the
// locked protocol (PURE). The checklist is what the reviewer assesses each study
// against — from §3 (the protocol), NOT the AI's take. FOUNDATION §10.
// ─────────────────────────────────────────────────────────────────────────────

// Short labels get highlighted; drop trivially short tokens so the abstract does
// not light up on stop-words like "a" / "of".
const MIN_TERM_LENGTH = 3;

function toCriterionDTO(criterion: {
  id: string;
  label: string;
  instruction: string;
}): ScreeningCriterionDTO {
  return {
    id: criterion.id,
    label: criterion.label,
    instruction: criterion.instruction,
  };
}

export function deriveCriteria(
  content: ProtocolContent | null,
): ScreeningCriteriaDTO {
  if (!content) return { include: [], exclude: [] };
  return {
    include: content.criteria
      .filter((c) => c.kind === 'include')
      .map(toCriterionDTO),
    exclude: content.criteria
      .filter((c) => c.kind === 'exclude')
      .map(toCriterionDTO),
  };
}

function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (term.length < MIN_TERM_LENGTH) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

// Highlight terms: inclusion-criterion labels plus the PICO population /
// intervention / outcome go Jade; exclusion-criterion labels go Tomato. Labels
// are concrete phrases ("SGLT2 inhibitor", "RCT"), so this highlights the
// concepts the protocol actually names — never anything AI-derived.
export function deriveHighlightTerms(
  content: ProtocolContent | null,
): HighlightTermsDTO {
  if (!content) return { include: [], exclude: [] };

  const includeLabels = content.criteria
    .filter((c) => c.kind === 'include')
    .map((c) => c.label);
  const excludeLabels = content.criteria
    .filter((c) => c.kind === 'exclude')
    .map((c) => c.label);

  const picoTerms = [
    content.pico.population,
    content.pico.intervention,
    content.pico.outcome,
  ];

  return {
    include: dedupeTerms([...includeLabels, ...picoTerms]),
    exclude: dedupeTerms(excludeLabels),
  };
}
