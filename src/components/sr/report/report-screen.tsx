'use client';

import { useState, useTransition } from 'react';
import { Lock, PenLine, Sparkles } from 'lucide-react';
import {
  REPORT_SOURCE_LABEL,
  type CharacteristicCellDTO,
  type DraftReportActionResult,
  type MethodsStatement,
  type ReportDraftResult,
  type ReportViewDTO,
} from '@/lib/sr/report/types';
import styles from './report-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// The Report screen (T18) — a grounded, citable manuscript scaffold.
//   • Every number on this screen arrives in the view already computed
//     (visible-table counts, or chokepoint-gated aggregates); a `withheld`
//     section renders a lock note, never a count.
//   • Every claim carries a source chip naming the record set it derives from;
//     drafted sentences carry their citation keys.
//   • The AI drafts are clearly labeled and land in an editable field — the
//     human owns the text. Conclusions & certainty are human-only: there is no
//     draft path into them.
// ─────────────────────────────────────────────────────────────────────────────

interface ReportScreenProps {
  view: ReportViewDTO;
  draftAction: (reviewId: string) => Promise<DraftReportActionResult>;
  /** A draft to hydrate with (e.g. a persisted one). Also the test seam. */
  initialDraft?: ReportDraftResult | null;
}

function SourceChip({ source }: { source: MethodsStatement['source'] }) {
  return (
    <span className={styles.sourceChip}>{REPORT_SOURCE_LABEL[source]}</span>
  );
}

function Cell({ cell }: { cell: CharacteristicCellDTO }) {
  if (cell.state === 'reported' && cell.value) {
    return <span>{cell.value}</span>;
  }
  const label =
    cell.state === 'not_reported'
      ? 'Not reported'
      : cell.state === 'na'
        ? 'N/A'
        : cell.state === 'unclear'
          ? 'Unclear'
          : 'Pending consensus';
  return <span className={styles.stateCell}>{label}</span>;
}

function WithheldNote({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.withheld} data-testid="withheld">
      <Lock size={13} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function MethodsItem({
  label,
  statements,
}: {
  label: string;
  statements: MethodsStatement[];
}) {
  return (
    <div className={styles.methodsItem}>
      <div className={styles.methodsItemLabel}>{label}</div>
      {statements.map((s) => (
        <p className={styles.methodsStatement} key={s.text}>
          {s.text} <SourceChip source={s.source} />
        </p>
      ))}
    </div>
  );
}

function draftSectionText(
  section: ReportDraftResult['sections'][number],
): string {
  return section.sentences
    .map((s) => `${s.text} ${s.citationKeys.map((k) => `[${k}]`).join('')}`)
    .join(' ');
}

export function ReportScreen({
  view,
  draftAction,
  initialDraft = null,
}: ReportScreenProps) {
  const [draft, setDraft] = useState<ReportDraftResult | null>(initialDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>(() =>
    initialDraft
      ? Object.fromEntries(
          initialDraft.sections.map((s) => [s.id, draftSectionText(s)]),
        )
      : {},
  );
  const [conclusions, setConclusions] = useState('');
  const [pending, startTransition] = useTransition();

  const runDraft = () => {
    setDraftError(null);
    startTransition(async () => {
      const result = await draftAction(view.reviewId);
      if (result.ok) {
        setDraft(result.draft);
        setEdits(
          Object.fromEntries(
            result.draft.sections.map((s) => [s.id, draftSectionText(s)]),
          ),
        );
      } else {
        setDraftError(result.message);
      }
    });
  };

  return (
    <div className={styles.screen}>
      <header>
        <div className={styles.eyebrow}>Report · {view.reviewType}</div>
        <h1 className={styles.title}>{view.reviewTitle}</h1>
        <p className={styles.lead}>
          A grounded manuscript scaffold: every number below is computed from
          this review&rsquo;s own records and carries its source. Nothing is
          invented — a silent paper reads <b>Not reported</b>, a still-blinded
          surface reads <b>withheld</b>.
        </p>
        <div className={styles.countRow}>
          {view.counts.map((count) => (
            <span className={styles.countPill} key={count.key}>
              <b className={styles.countValue}>{count.value}</b> {count.label}
              <SourceChip source={count.source} />
            </span>
          ))}
        </div>
      </header>

      <section aria-labelledby="report-methods">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-methods">
            Methods · data collection
          </h2>
          <span className={styles.autoBadge}>
            Auto-assembled from recorded metadata
          </span>
        </div>
        <MethodsItem
          label="Item 8 · Selection process"
          statements={view.methods.selection}
        />
        <MethodsItem
          label="Item 9 · Data collection process"
          statements={view.methods.dataCollection}
        />
        <MethodsItem
          label="Item 10 · Data items"
          statements={view.methods.dataItems}
        />
      </section>

      <section aria-labelledby="report-screening">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-screening">
            Study selection
          </h2>
        </div>
        {view.screening.status === 'withheld' ? (
          <WithheldNote>
            Selection counts are withheld while screening is independent — they
            are aggregates over every reviewer&rsquo;s blinded decisions and
            open with reconciliation.
          </WithheldNote>
        ) : (
          <>
            <p className={styles.bodyText}>
              <b className={styles.num}>{view.screening.included}</b> studies
              included and{' '}
              <b className={styles.num}>{view.screening.excluded}</b> records
              excluded at {view.screening.stage.replace('_', ' & ')} screening
              {view.screening.conflictPending > 0 ? (
                <>
                  ;{' '}
                  <b className={styles.num}>{view.screening.conflictPending}</b>{' '}
                  conflicts await resolution
                </>
              ) : null}
              {view.screening.inProgress > 0 ? (
                <>
                  ; <b className={styles.num}>{view.screening.inProgress}</b>{' '}
                  records still in screening
                </>
              ) : null}
              . <SourceChip source="screening_records" />
            </p>
            {view.screening.excludeReasons.length > 0 ? (
              <ul className={styles.reasonList}>
                {view.screening.excludeReasons.map((reason) => (
                  <li key={reason.label}>
                    <span className={styles.num}>{reason.count}</span> ·{' '}
                    {reason.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="report-characteristics">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-characteristics">
            Characteristics of included studies
          </h2>
          <span className={styles.autoBadge}>From consensus extraction</span>
        </div>
        {view.characteristics.length === 0 ? (
          <p className={styles.emptyNote}>
            No studies are included yet — this table fills from the consensus
            extraction once screening reconciliation records inclusions.
          </p>
        ) : (
          <div className={styles.table} role="table">
            <div className={`${styles.tr} ${styles.th}`} role="row">
              <div role="columnheader">Study</div>
              <div role="columnheader">Design</div>
              <div role="columnheader">Population</div>
              <div role="columnheader">n</div>
              <div role="columnheader">Primary outcome</div>
            </div>
            {view.characteristics.map((row) => (
              <div className={styles.tr} role="row" key={row.citationKey}>
                <div role="cell">
                  <span className={styles.refKey}>[{row.citationKey}]</span>{' '}
                  {row.reference}
                </div>
                <div role="cell">
                  <Cell cell={row.design} />
                </div>
                <div role="cell">
                  <Cell cell={row.population} />
                </div>
                <div role="cell" className={styles.num}>
                  <Cell cell={row.sampleSize} />
                </div>
                <div role="cell">
                  <Cell cell={row.primaryOutcome} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="report-rob">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-rob">
            Risk of bias
          </h2>
        </div>
        {view.rob.status === 'withheld' ? (
          <WithheldNote>
            Risk-of-bias roll-ups are withheld while appraisal is independent —
            they open with reconciliation.
          </WithheldNote>
        ) : (
          <ul className={styles.reasonList}>
            {view.rob.distribution
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => (
                <li key={bucket.outcome}>
                  <span className={styles.num}>{bucket.count}</span> ·{' '}
                  {bucket.label} <SourceChip source="rob_records" />
                </li>
              ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="report-draft">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-draft">
            Drafted prose
          </h2>
          {view.canDraft ? (
            <button
              type="button"
              className={styles.draftButton}
              onClick={runDraft}
              disabled={pending}
            >
              <Sparkles size={13} aria-hidden />
              {pending ? 'Drafting…' : 'Draft grounded prose'}
            </button>
          ) : null}
        </div>
        <p className={styles.helperText}>
          The AI drafts only from the grounded sources above — every sentence
          cites its source and may use no number the data doesn&rsquo;t carry.
          Drafts are labeled and yours to edit.
        </p>
        {draftError ? <p className={styles.errorText}>{draftError}</p> : null}
        {draft ? (
          <>
            {draft.droppedSentences > 0 || draft.droppedSections > 0 ? (
              <p className={styles.droppedNote} data-testid="dropped-note">
                Grounding gate: {draft.droppedSentences} sentence(s) failed
                grounding and {draft.droppedSections} out-of-scope section(s)
                were dropped.
              </p>
            ) : null}
            {draft.sections.map((section) => (
              <div className={styles.draftSection} key={section.id}>
                <div className={styles.draftHead}>
                  <h3 className={styles.draftHeading}>{section.heading}</h3>
                  <span className={styles.aiBadge}>
                    <Sparkles size={10} aria-hidden /> AI · drafted from your
                    recorded data — review &amp; edit
                  </span>
                </div>
                <div className={styles.draftSentences}>
                  {section.sentences.map((sentence) => (
                    <span className={styles.sentence} key={sentence.text}>
                      {sentence.text}{' '}
                      {sentence.citationKeys.map((key) => (
                        <span className={styles.citeChip} key={key}>
                          {key}
                        </span>
                      ))}{' '}
                    </span>
                  ))}
                </div>
                <label className={styles.editLabel}>
                  Your edit
                  <textarea
                    className={styles.editArea}
                    value={edits[section.id] ?? ''}
                    onChange={(event) =>
                      setEdits((prev) => ({
                        ...prev,
                        [section.id]: event.target.value,
                      }))
                    }
                    rows={4}
                  />
                </label>
              </div>
            ))}
          </>
        ) : null}
      </section>

      <section aria-labelledby="report-conclusions">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="report-conclusions">
            Conclusions &amp; certainty
          </h2>
          <span className={styles.humanBadge}>
            <PenLine size={10} aria-hidden /> Yours to write
          </span>
        </div>
        <p className={styles.helperText}>
          Slate never drafts a conclusion, a synthesis of effect, or a
          certainty/GRADE rating — those judgements are the authors&rsquo;.
        </p>
        <label className={styles.editLabel}>
          Conclusions
          <textarea
            className={styles.editArea}
            value={conclusions}
            onChange={(event) => setConclusions(event.target.value)}
            rows={4}
            placeholder="Write the conclusions and certainty assessment here."
          />
        </label>
      </section>

      {view.references.length > 0 ? (
        <section aria-labelledby="report-references">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="report-references">
              References
            </h2>
          </div>
          <ol className={styles.refList}>
            {view.references.map((ref) => (
              <li key={ref.citationKey}>
                {ref.label} — {ref.title}
                {ref.journal ? ` · ${ref.journal}` : ''}
                {ref.year !== null ? ` (${ref.year})` : ''}
                {ref.doi ? ` · doi:${ref.doi}` : ''}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
