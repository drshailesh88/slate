import type { RobAssessmentView } from '@/lib/sr/authz/blinded-read';
import { isRobJudgement } from './domains';
import type {
  RobReconcileDomainDTO,
  RobReconcileStudyDTO,
  RobReviewerJudgementDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The reconcile assembler (T16) — PURE. Runs ONLY at `reconcile`, over the rows
// the chokepoint hands back once the firewall has flipped (visibility = 'all').
// It groups every reviewer's judgement — and the AI reviewer's SUGGESTION —
// per (study, domain), at equal visual weight, and separates out the reconciled
// (consensus) call authored by the reconciler.
//
// Anti-anchoring rules (design.md §7 / extraction spec §4):
//   • the AI suggestion is LABELED (`isAi`) and never pre-selected as consensus;
//   • the consensus column starts empty and fills ONLY on the reconciler's own
//     recorded judgement — the AI never writes it.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileOptions {
  /**
   * The id whose rows are the reconciled/consensus call (the caller's own id when
   * the caller can reconcile; `null` when the viewer is not a reconciler — then
   * every row is shown as an equal input and no consensus is editable).
   */
  consensusAuthorId: string | null;
  /** Human-readable label for a row's author (reviewer name / "AI reviewer"). */
  labelFor: (reviewerId: string, isAi: boolean) => string;
  /** The instrument's ordered domains for a study: (studyId) → [{id, name}]. */
  domainsFor: (studyId: string) => ReadonlyArray<{ id: string; name: string }>;
  /** The studies to build reconcile cards for, in display order. */
  studyIds: readonly string[];
}

function entrySort(
  a: RobReviewerJudgementDTO,
  b: RobReviewerJudgementDTO,
): number {
  // Humans first, the AI suggestion last — it is one more input, never the lead.
  if (a.isAi !== b.isAi) return a.isAi ? 1 : -1;
  return a.authorLabel.localeCompare(b.authorLabel);
}

export function assembleReconciliation(
  rows: readonly RobAssessmentView[],
  opts: ReconcileOptions,
): RobReconcileStudyDTO[] {
  // Index rows: studyId → domainId → row[].
  const byStudyDomain = new Map<string, Map<string, RobAssessmentView[]>>();
  for (const row of rows) {
    if (!isRobJudgement(row.judgement)) continue;
    const domains =
      byStudyDomain.get(row.studyId) ?? new Map<string, RobAssessmentView[]>();
    const list = domains.get(row.domain) ?? [];
    list.push(row);
    domains.set(row.domain, list);
    byStudyDomain.set(row.studyId, domains);
  }

  return opts.studyIds.map((studyId) => {
    const domains = byStudyDomain.get(studyId) ?? new Map();
    const domainDtos: RobReconcileDomainDTO[] = opts
      .domainsFor(studyId)
      .map((domainMeta) => {
        const rowsForDomain: RobAssessmentView[] =
          domains.get(domainMeta.id) ?? [];

        const entries: RobReviewerJudgementDTO[] = [];
        let consensus: string | null = null;
        let consensusSupportQuote: string | null = null;

        for (const row of rowsForDomain) {
          if (
            opts.consensusAuthorId !== null &&
            row.reviewerId === opts.consensusAuthorId &&
            !row.isAi
          ) {
            consensus = row.judgement;
            consensusSupportQuote = row.supportQuote;
            continue;
          }
          entries.push({
            authorLabel: opts.labelFor(row.reviewerId, row.isAi),
            isAi: row.isAi,
            judgement: row.judgement as RobReviewerJudgementDTO['judgement'],
            supportQuote: row.supportQuote,
          });
        }

        entries.sort(entrySort);

        return {
          domainId: domainMeta.id,
          name: domainMeta.name,
          entries,
          consensus:
            consensus && isRobJudgement(consensus)
              ? (consensus as RobReconcileDomainDTO['consensus'])
              : null,
          consensusSupportQuote,
        };
      });

    return { studyId, domains: domainDtos };
  });
}
