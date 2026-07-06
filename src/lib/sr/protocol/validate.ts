import { EMPTY_PICO } from './constants';
import type {
  AnswerStructure,
  EligibilityCriterion,
  Pico,
  ProtocolContent,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Boundary sanitizer. Server actions receive arbitrary client-shaped input; this
// coerces it into a well-formed ProtocolContent (never trusts the payload). It
// caps field sizes, drops malformed criteria, and normalizes the enums. Pure and
// deterministic so it is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

const RQ_MAX = 4000;
const PICO_MAX = 2000;
const LABEL_MAX = 500;
const INSTRUCTION_MAX = 4000;
const ID_MAX = 100;
const REASON_MAX = 2000;
const MAX_CRITERIA = 200;

const ANSWER_STRUCTURES: readonly AnswerStructure[] = [
  'any',
  'specified',
  'yes_no_maybe',
];

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizePico(raw: unknown): Pico {
  const record = asRecord(raw);
  return {
    population: asString(record.population, PICO_MAX),
    intervention: asString(record.intervention, PICO_MAX),
    comparator: asString(record.comparator, PICO_MAX),
    outcome: asString(record.outcome, PICO_MAX),
    studyDesign: asString(record.studyDesign, PICO_MAX),
  } satisfies Pico;
}

function sanitizeCriterion(
  raw: unknown,
  index: number,
): EligibilityCriterion | null {
  const record = asRecord(raw);
  const kind = record.kind === 'exclude' ? 'exclude' : 'include';
  const label = asString(record.label, LABEL_MAX).trim();
  const instruction = asString(record.instruction, INSTRUCTION_MAX);
  // A criterion with no label is noise (an empty row) — drop it.
  if (label.length === 0) {
    return null;
  }
  const rawId = asString(record.id, ID_MAX).trim();
  const answerStructure = ANSWER_STRUCTURES.includes(
    record.answerStructure as AnswerStructure,
  )
    ? (record.answerStructure as AnswerStructure)
    : 'yes_no_maybe';

  return {
    id: rawId.length > 0 ? rawId : `crit-${index}`,
    kind,
    label,
    instruction,
    answerStructure,
  };
}

export function sanitizeProtocolContent(raw: unknown): ProtocolContent {
  const record = asRecord(raw);
  const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];
  const criteria = rawCriteria
    .slice(0, MAX_CRITERIA)
    .map((c, i) => sanitizeCriterion(c, i))
    .filter((c): c is EligibilityCriterion => c !== null);

  return {
    researchQuestion: asString(record.researchQuestion, RQ_MAX),
    pico:
      record.pico === undefined ? { ...EMPTY_PICO } : sanitizePico(record.pico),
    criteria,
  };
}

export function sanitizeReason(raw: unknown): string {
  return asString(raw, REASON_MAX).trim();
}
