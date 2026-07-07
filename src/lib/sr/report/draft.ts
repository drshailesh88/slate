import { filterGroundedSentences, type GroundingSource } from './grounding';
import type {
  DraftableSectionId,
  DraftSentence,
  ReportDraftResult,
  ReportDraftSection,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The report draft orchestration — PURE (the model is injected, mock in tests).
//
// The AI drafts PROSE ONLY, over a closed grounding table; the numbers are
// computed upstream, never generated. Two structural guarantees enforced here:
//
//   • NO AUTONOMOUS SYNTHESIS / GRADE — `DRAFTABLE_SECTIONS` is the closed
//     allowlist ('abstract', 'findings'). Conclusions, certainty and GRADE are
//     the human's; a model-emitted section outside the allowlist is DROPPED
//     (and counted), so no code path can put an AI conclusion in the report.
//   • SENTENCE-LEVEL GROUNDING — every kept sentence cites ≥1 known source and
//     carries no number its cited sources don't support (grounding.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const DRAFTABLE_SECTIONS: readonly DraftableSectionId[] = [
  'abstract',
  'findings',
];

export const DRAFT_SECTION_HEADINGS: Record<DraftableSectionId, string> = {
  abstract: 'Abstract',
  findings: 'Summary of findings',
};

// What the injected model returns BEFORE validation: ids arrive as plain
// strings so a misbehaving model is representable (and provably rejected).
export interface RawDraftSection {
  id: string;
  sentences: DraftSentence[];
}

export interface ReportDraftInput {
  reviewTitle: string;
  reviewType: string;
  /** The closed grounding table — the only material the model may draw on. */
  sources: GroundingSource[];
}

// The injected LLM port. `model`/`version` identify what ran (the draft label
// states them). `draft` is the only call; mock-model.ts is the deterministic
// test/dev implementation, vercel-model.ts the live adapter.
export interface ReportDraftModel {
  readonly model: string;
  readonly version: string;
  draft(input: ReportDraftInput): Promise<{ sections: RawDraftSection[] }>;
}

function isDraftable(id: string): id is DraftableSectionId {
  return (DRAFTABLE_SECTIONS as readonly string[]).includes(id);
}

export async function draftReportSections(args: {
  model: ReportDraftModel;
  input: ReportDraftInput;
}): Promise<ReportDraftResult> {
  const raw = await args.model.draft(args.input);

  let droppedSections = 0;
  let droppedSentences = 0;
  const sections: ReportDraftSection[] = [];

  for (const section of raw.sections) {
    if (!isDraftable(section.id)) {
      droppedSections += 1;
      continue;
    }
    const { kept, dropped } = filterGroundedSentences(
      section.sentences,
      args.input.sources,
    );
    droppedSentences += dropped;
    if (kept.length === 0) continue;
    sections.push({
      id: section.id,
      heading: DRAFT_SECTION_HEADINGS[section.id],
      sentences: kept,
    });
  }

  return { sections, droppedSentences, droppedSections };
}
