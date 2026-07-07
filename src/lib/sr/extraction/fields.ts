// ─────────────────────────────────────────────────────────────────────────────
// The default extraction FORM template (Cochrane ch.5 sections). Pure data:
// General info · Characteristics · Outcomes. Per-review custom forms are a later
// task; until then every review extracts against this stable template, so the
// field ids are a fixed contract the entries + consensus rows key on.
//
// `critical` marks outcome/effect fields — the ones a QC spot-check samples (a
// shared misread on an effect estimate is the costly kind). See ./qc.
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractionSectionId = 'general' | 'characteristics' | 'outcomes';

export interface ExtractionFieldDef {
  id: string;
  section: ExtractionSectionId;
  label: string;
  /** Hint shown under the field (what to record). */
  hint: string;
  /** Outcome/effect field → eligible for QC sampling of agreed values. */
  critical: boolean;
}

export interface ExtractionSectionDef {
  id: ExtractionSectionId;
  label: string;
  fields: ExtractionFieldDef[];
}

const FIELDS: readonly ExtractionFieldDef[] = [
  // ── General information ──────────────────────────────────────────────────
  {
    id: 'study_design',
    section: 'general',
    label: 'Study design',
    hint: 'e.g. parallel RCT, cluster RCT, cohort',
    critical: false,
  },
  {
    id: 'country',
    section: 'general',
    label: 'Country / setting',
    hint: 'Where the study was conducted',
    critical: false,
  },
  {
    id: 'funding_source',
    section: 'general',
    label: 'Funding source',
    hint: 'Declared funder(s) and conflicts',
    critical: false,
  },
  // ── Participant characteristics ──────────────────────────────────────────
  {
    id: 'sample_size',
    section: 'characteristics',
    label: 'Total sample size',
    hint: 'Number randomised / analysed',
    critical: false,
  },
  {
    id: 'mean_age',
    section: 'characteristics',
    label: 'Mean age',
    hint: 'With SD / range where given',
    critical: false,
  },
  {
    id: 'population',
    section: 'characteristics',
    label: 'Population / condition',
    hint: 'Diagnosis, inclusion population',
    critical: false,
  },
  // ── Outcomes (critical → QC-sampled) ─────────────────────────────────────
  {
    id: 'primary_outcome',
    section: 'outcomes',
    label: 'Primary outcome',
    hint: 'Definition + measurement instrument',
    critical: true,
  },
  {
    id: 'effect_estimate',
    section: 'outcomes',
    label: 'Effect estimate',
    hint: 'e.g. RR / OR / MD with direction',
    critical: true,
  },
  {
    id: 'confidence_interval',
    section: 'outcomes',
    label: '95% confidence interval',
    hint: 'Lower–upper bound',
    critical: true,
  },
  {
    id: 'events_intervention',
    section: 'outcomes',
    label: 'Events — intervention',
    hint: 'n events / N (never a blank 0)',
    critical: true,
  },
  {
    id: 'events_control',
    section: 'outcomes',
    label: 'Events — control',
    hint: 'n events / N (never a blank 0)',
    critical: true,
  },
];

const SECTION_LABEL: Record<ExtractionSectionId, string> = {
  general: 'General information',
  characteristics: 'Participant characteristics',
  outcomes: 'Outcomes',
};

const SECTION_ORDER: readonly ExtractionSectionId[] = [
  'general',
  'characteristics',
  'outcomes',
];

export const EXTRACTION_FIELDS: readonly ExtractionFieldDef[] = FIELDS;

export function extractionSections(): ExtractionSectionDef[] {
  return SECTION_ORDER.map((id) => ({
    id,
    label: SECTION_LABEL[id],
    fields: FIELDS.filter((f) => f.section === id),
  }));
}

export function isExtractionFieldId(fieldId: string): boolean {
  return FIELDS.some((f) => f.id === fieldId);
}

export function criticalFieldIds(): string[] {
  return FIELDS.filter((f) => f.critical).map((f) => f.id);
}

export function fieldDef(fieldId: string): ExtractionFieldDef | null {
  return FIELDS.find((f) => f.id === fieldId) ?? null;
}
