// Preset exclusion reasons (PRISMA 2020 Item 16b: report the reason for each
// exclusion). A structured code drives the per-reason PRISMA counts; the free
// text `excludeReasonDetail` captures anything the presets miss. PURE — shared by
// the server validator and the client reason picker so the code set is one truth.

export interface ExcludeReasonOption {
  code: string;
  label: string;
}

export const EXCLUDE_REASONS: readonly ExcludeReasonOption[] = [
  { code: 'wrong_population', label: 'Wrong population' },
  { code: 'wrong_intervention', label: 'Wrong intervention' },
  { code: 'wrong_comparator', label: 'Wrong comparator' },
  { code: 'wrong_outcome', label: 'Wrong outcome' },
  { code: 'wrong_study_design', label: 'Wrong study design' },
  { code: 'wrong_publication_type', label: 'Wrong publication type' },
  { code: 'not_english', label: 'Language not eligible' },
  { code: 'duplicate', label: 'Duplicate record' },
  { code: 'other', label: 'Other (add a note)' },
];

const CODES = new Set(EXCLUDE_REASONS.map((r) => r.code));

export function isExcludeReasonCode(value: string): boolean {
  return CODES.has(value);
}

export function excludeReasonLabel(code: string | null): string | null {
  if (!code) return null;
  return EXCLUDE_REASONS.find((r) => r.code === code)?.label ?? code;
}
