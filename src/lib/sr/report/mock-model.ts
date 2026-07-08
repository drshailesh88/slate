import type { ReportDraftInput, ReportDraftModel } from './draft';

// ─────────────────────────────────────────────────────────────────────────────
// The deterministic ReportDraftModel — no key, no network. Grounded BY
// CONSTRUCTION: every sentence restates one grounding source's own description
// and cites exactly that source, so the mock always passes the grounding gate.
// Used by the unit tests (and available for local dev without the founder key).
// ─────────────────────────────────────────────────────────────────────────────

export function createMockReportDraftModel(): ReportDraftModel {
  return {
    model: 'mock/report-draft',
    version: 'deterministic',
    async draft(input: ReportDraftInput) {
      const counts = input.sources.filter((s) => s.key.startsWith('C:'));
      const studies = input.sources.filter((s) => !s.key.startsWith('C:'));

      return {
        sections: [
          {
            id: 'abstract',
            sentences: counts.map((source) => ({
              text: `${source.description}.`,
              citationKeys: [source.key],
            })),
          },
          {
            id: 'findings',
            sentences: studies.map((source) => ({
              text: `${source.description}.`,
              citationKeys: [source.key],
            })),
          },
        ],
      };
    },
  };
}
