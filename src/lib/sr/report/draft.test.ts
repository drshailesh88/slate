import { describe, expect, it } from 'vitest';
import {
  DRAFTABLE_SECTIONS,
  draftReportSections,
  type ReportDraftInput,
  type ReportDraftModel,
} from './draft';
import { createMockReportDraftModel } from './mock-model';
import type { GroundingSource } from './grounding';

// ─────────────────────────────────────────────────────────────────────────────
// The draft orchestration (mocked LLM — deterministic, no key, no network).
// Two structural guarantees under test:
//   • no autonomous synthesis/GRADE — sections outside the allowlist are
//     dropped, so no model output can put a conclusion in the report;
//   • sentence-level grounding — hallucinated numbers/citations die here.
// ─────────────────────────────────────────────────────────────────────────────

const SOURCES: GroundingSource[] = [
  {
    key: 'C:identified',
    label: 'Records identified',
    description: 'Records identified: 412',
    allowedNumbers: [412],
  },
  {
    key: 'S1',
    label: 'Anker 2021',
    description: '[1] Anker 2021 — Empagliflozin in HFpEF (n = 5988)',
    allowedNumbers: [2021, 1, 5988],
  },
];

const INPUT: ReportDraftInput = {
  reviewTitle: 'SGLT2 inhibitors in heart failure',
  reviewType: 'Intervention review',
  sources: SOURCES,
};

function fakeModel(
  sections: Array<{
    id: string;
    sentences: Array<{ text: string; citationKeys: string[] }>;
  }>,
): ReportDraftModel {
  return {
    model: 'fake',
    version: 'test',
    async draft() {
      return { sections };
    },
  };
}

describe('the draftable allowlist — no autonomous synthesis or GRADE', () => {
  it('conclusions/certainty/GRADE are not draftable section ids', () => {
    expect(DRAFTABLE_SECTIONS).toEqual(['abstract', 'findings']);
    expect(DRAFTABLE_SECTIONS).not.toContain('conclusions');
    expect(DRAFTABLE_SECTIONS).not.toContain('certainty');
    expect(DRAFTABLE_SECTIONS).not.toContain('grade');
  });

  it('a model-emitted conclusions section is dropped and counted', async () => {
    const result = await draftReportSections({
      model: fakeModel([
        {
          id: 'conclusions',
          sentences: [
            {
              text: 'SGLT2 inhibitors should be recommended for all patients.',
              citationKeys: ['S1'],
            },
          ],
        },
        {
          id: 'abstract',
          sentences: [
            {
              text: 'Records identified: 412.',
              citationKeys: ['C:identified'],
            },
          ],
        },
      ]),
      input: INPUT,
    });
    expect(result.droppedSections).toBe(1);
    expect(result.sections.map((s) => s.id)).toEqual(['abstract']);
    const allText = result.sections
      .flatMap((s) => s.sentences)
      .map((s) => s.text)
      .join(' ');
    expect(allText).not.toContain('recommended');
  });

  it('a GRADE-labeled section is likewise structurally rejected', async () => {
    const result = await draftReportSections({
      model: fakeModel([
        {
          id: 'grade',
          sentences: [
            { text: 'Certainty of evidence: high.', citationKeys: ['S1'] },
          ],
        },
      ]),
      input: INPUT,
    });
    expect(result.sections).toEqual([]);
    expect(result.droppedSections).toBe(1);
  });
});

describe('sentence-level grounding on the drafted prose', () => {
  it('drops a sentence carrying a number the cited data does not support', async () => {
    const result = await draftReportSections({
      model: fakeModel([
        {
          id: 'findings',
          sentences: [
            {
              text: 'Anker 2021 randomised 5,988 participants.',
              citationKeys: ['S1'],
            },
            {
              text: 'Hospitalisation fell by 27%.',
              citationKeys: ['S1'],
            },
          ],
        },
      ]),
      input: INPUT,
    });
    expect(result.droppedSentences).toBe(1);
    expect(result.sections[0].sentences).toHaveLength(1);
    expect(result.sections[0].sentences[0].text).toContain('5,988');
  });

  it('drops uncited and unknown-cited sentences; an all-dropped section vanishes', async () => {
    const result = await draftReportSections({
      model: fakeModel([
        {
          id: 'abstract',
          sentences: [
            { text: 'An uncited claim.', citationKeys: [] },
            { text: 'A ghost-cited claim.', citationKeys: ['S42'] },
          ],
        },
      ]),
      input: INPUT,
    });
    expect(result.sections).toEqual([]);
    expect(result.droppedSentences).toBe(2);
  });

  it('every kept sentence carries at least one citation key', async () => {
    const result = await draftReportSections({
      model: createMockReportDraftModel(),
      input: INPUT,
    });
    for (const section of result.sections) {
      for (const sentence of section.sentences) {
        expect(sentence.citationKeys.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the deterministic mock model', () => {
  it('drafts grounded-by-construction sections that fully pass the gate', async () => {
    const result = await draftReportSections({
      model: createMockReportDraftModel(),
      input: INPUT,
    });
    expect(result.droppedSentences).toBe(0);
    expect(result.droppedSections).toBe(0);
    expect(result.sections.map((s) => s.id)).toEqual(['abstract', 'findings']);
    expect(result.sections[0].heading).toBe('Abstract');
  });

  it('is deterministic — the same input drafts the same prose', async () => {
    const model = createMockReportDraftModel();
    const a = await draftReportSections({ model, input: INPUT });
    const b = await draftReportSections({ model, input: INPUT });
    expect(a).toEqual(b);
  });
});
