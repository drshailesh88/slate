'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import {
  finishExtractionAction,
  leaveUnresolvedAction,
  logAuthorContactAction,
  resolveFieldAction,
  saveEntryAction,
  unblindExtractionAction,
} from '@/app/(app)/systematic-review/[reviewId]/extraction/actions';
import {
  EXTRACTION_STATES,
  stateLabel,
  type ExtractionState,
} from '@/lib/sr/extraction/states';
import type {
  ExtractionViewDTO,
  IndependentExtractionViewDTO,
  OwnEntryDTO,
  ProvenanceDTO,
  ReconcileEntryDTO,
  ReconcileFieldDTO,
  ReconcileStudyDTO,
  ReconcileExtractionViewDTO,
} from '@/lib/sr/extraction/types';
import styles from './extraction-screen.module.css';

// Screen 6 — two-phase data extraction (T15 · ★). Phase 1 is a blinded per-study
// form (own values only — no co-reviewer, no AI). Phase 2 is the symmetric picker:
// both extractions at EQUAL weight, neither pre-selected, consensus starts empty,
// the AI value hidden until the human opens the source. The blinding is enforced
// server-side; this screen is only ever handed what the phase permits.

export function ExtractionScreen({ view }: { view: ExtractionViewDTO }) {
  return (
    <div className={styles.screen}>
      <div className={styles.eyebrow}>Stage 6 · The funnel</div>
      <h1 className={styles.title}>Data extraction</h1>
      {view.phase === 'independent' ? (
        <IndependentPhase view={view} />
      ) : (
        <ReconcilePhase view={view} />
      )}
    </div>
  );
}

// ─── Phase 1 — independent extraction ────────────────────────────────────────

function IndependentPhase({ view }: { view: IndependentExtractionViewDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [studyId, setStudyId] = useState(view.studies[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const study = view.studies.find((s) => s.id === studyId) ?? null;

  const finish = () => {
    setError(null);
    startTransition(async () => {
      const result = await finishExtractionAction(view.reviewId);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };

  const unblind = () => {
    setError(null);
    startTransition(async () => {
      const result = await unblindExtractionAction(view.reviewId);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };

  return (
    <>
      <p className={styles.lead}>
        Two reviewers extract each study <b>independently</b>. Errors that peer
        review misses are caught by this duplicate — so your partner&apos;s
        values and any AI suggestion stay hidden until you both lock.
      </p>

      <div className={styles.blindBanner} role="note">
        <ShieldAlert size={13} aria-hidden />
        <span>
          <b>Extracting independently.</b> Your partner&apos;s entries and AI
          suggestions are hidden until you both lock — this protects the review
          from correlated errors.
        </span>
      </div>

      <div className={styles.progressRow}>
        <span className={styles.progressPill}>
          {view.progress.finishedReviewers} of {view.progress.totalReviewers}{' '}
          reviewers finished
        </span>
        {view.finished ? (
          <span className={styles.waitPill}>
            <Lock size={11} aria-hidden /> You&apos;ve locked — waiting for your
            partner
          </span>
        ) : null}
      </div>

      {!view.canExtract ? (
        <div className={styles.stateBlock}>
          <h3 className={styles.stateTitle}>You are not an extractor</h3>
          <p className={styles.stateBody}>
            Only reviewers and collaborators extract data. You can follow
            progress here; reconciliation opens after both reviewers lock.
          </p>
          {view.canUnblind ? (
            <button
              type="button"
              className={styles.unblindBtn}
              onClick={unblind}
              disabled={pending}
            >
              Reveal entries for reconciliation
            </button>
          ) : null}
        </div>
      ) : view.studies.length === 0 ? (
        <div className={styles.stateBlock}>
          <h3 className={styles.stateTitle}>No studies to extract</h3>
          <p className={styles.stateBody}>
            Included studies appear here for dual extraction once screening is
            complete.
          </p>
        </div>
      ) : (
        <div className={styles.workspace}>
          <nav className={styles.studyList} aria-label="Studies to extract">
            {view.studies.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.studyItem} ${s.id === studyId ? styles.studyItemActive : ''}`}
                onClick={() => setStudyId(s.id)}
              >
                <span className={styles.studyRef}>{s.refId}</span>
                <span className={styles.studyItemTitle}>{s.title}</span>
              </button>
            ))}
          </nav>

          <div className={styles.formPane}>
            {study ? (
              <>
                <div className={styles.formHead}>
                  <div className={styles.formTitle}>{study.title}</div>
                  <div className={styles.formMeta}>
                    {[study.authors, study.year, study.journal]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>

                {view.sections.map((section) => (
                  <section key={section.id} className={styles.section}>
                    <h4 className={styles.sectionLabel}>{section.label}</h4>
                    {section.fields.map((field) => (
                      <FieldEditor
                        key={field.id}
                        reviewId={view.reviewId}
                        studyId={study.id}
                        fieldId={field.id}
                        label={field.label}
                        hint={field.hint}
                        entry={view.ownEntries.find(
                          (e) =>
                            e.studyId === study.id && e.fieldId === field.id,
                        )}
                        locked={view.finished}
                      />
                    ))}
                  </section>
                ))}

                {!view.finished ? (
                  <div className={styles.lockBar}>
                    <button
                      type="button"
                      className={styles.finishBtn}
                      onClick={finish}
                      disabled={pending}
                    >
                      <Lock size={13} aria-hidden /> Finish extraction — reveal
                      for reconciliation
                    </button>
                    <span className={styles.lockNote}>
                      Locks all your entries. Reversible only until your partner
                      locks.
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}

function StatePicker({
  value,
  onChange,
  disabled,
  name,
}: {
  value: ExtractionState;
  onChange: (state: ExtractionState) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <div
      className={styles.states}
      role="radiogroup"
      aria-label={`State — ${name}`}
    >
      {EXTRACTION_STATES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={`${styles.stateBtn} ${value === s ? styles.stateBtnOn : ''}`}
          onClick={() => onChange(s)}
          disabled={disabled}
        >
          {stateLabel(s)}
        </button>
      ))}
    </div>
  );
}

function FieldEditor({
  reviewId,
  studyId,
  fieldId,
  label,
  hint,
  entry,
  locked,
}: {
  reviewId: string;
  studyId: string;
  fieldId: string;
  label: string;
  hint: string;
  entry: OwnEntryDTO | undefined;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(entry?.value ?? '');
  const [state, setState] = useState<ExtractionState>(
    entry?.state ?? 'reported',
  );
  const [derived, setDerived] = useState(entry?.derived ?? false);
  const [formula, setFormula] = useState(entry?.derivedFormula ?? '');
  const [provenance, setProvenance] = useState<ProvenanceDTO>({
    reportId: entry?.provenance?.reportId ?? '',
    page: entry?.provenance?.page ?? '',
    locator: entry?.provenance?.locator ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carriesValue = state === 'reported';

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveEntryAction({
        reviewId,
        studyId,
        fieldId,
        value: carriesValue ? value : null,
        state,
        derived: carriesValue && derived,
        derivedFormula: carriesValue && derived ? formula : null,
        provenance,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel}>{label}</label>
        {entry?.locked ? (
          <span className={styles.lockedTag}>
            <Lock size={9} aria-hidden /> Locked
          </span>
        ) : saved ? (
          <span className={styles.savedTag}>
            <Check size={9} aria-hidden /> Saved
          </span>
        ) : null}
      </div>
      <div className={styles.fieldHint}>{hint}</div>

      {carriesValue ? (
        <input
          className={styles.valueInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value as reported"
          disabled={locked || pending}
        />
      ) : (
        <div className={styles.dashedState}>{stateLabel(state)}</div>
      )}

      <StatePicker
        value={state}
        onChange={setState}
        disabled={locked || pending}
        name={label}
      />

      {carriesValue ? (
        <label className={styles.derivedRow}>
          <input
            type="checkbox"
            checked={derived}
            onChange={(e) => setDerived(e.target.checked)}
            disabled={locked || pending}
          />
          Derived (calculated / imputed)
        </label>
      ) : null}
      {carriesValue && derived ? (
        <input
          className={styles.formulaInput}
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="Formula, e.g. SD = (upper − lower) / 3.92"
          disabled={locked || pending}
        />
      ) : null}

      <div className={styles.provenance}>
        <input
          className={styles.provInput}
          value={provenance.reportId ?? ''}
          onChange={(e) =>
            setProvenance((p) => ({ ...p, reportId: e.target.value }))
          }
          placeholder="Report"
          disabled={locked || pending}
          aria-label="Source report"
        />
        <input
          className={styles.provInput}
          value={provenance.page ?? ''}
          onChange={(e) =>
            setProvenance((p) => ({ ...p, page: e.target.value }))
          }
          placeholder="Page"
          disabled={locked || pending}
          aria-label="Page"
        />
        <input
          className={styles.provInput}
          value={provenance.locator ?? ''}
          onChange={(e) =>
            setProvenance((p) => ({ ...p, locator: e.target.value }))
          }
          placeholder="Table / figure"
          disabled={locked || pending}
          aria-label="Table or figure"
        />
      </div>

      {!locked ? (
        <button
          type="button"
          className={styles.saveBtn}
          onClick={save}
          disabled={pending}
        >
          Save field
        </button>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

// ─── Phase 2 — reconciliation ────────────────────────────────────────────────

function ReconcilePhase({ view }: { view: ReconcileExtractionViewDTO }) {
  return (
    <>
      <p className={styles.lead}>
        Both reviewers&apos; extractions are shown at <b>equal weight</b>. The
        consensus starts empty — you verify every field, recording the value you
        agree on. Nothing resolves automatically.
      </p>

      <div className={styles.progressRow}>
        <span className={styles.verifyPill}>
          {view.fieldsToVerify} {view.fieldsToVerify === 1 ? 'field' : 'fields'}{' '}
          to verify
        </span>
        <span className={styles.qcPill}>
          QC sample {Math.round(view.qcSampleRate * 100)}% of agreed critical
          fields
        </span>
      </div>

      {view.studies.length === 0 ? (
        <div className={styles.stateBlock}>
          <h3 className={styles.stateTitle}>Nothing to reconcile</h3>
          <p className={styles.stateBody}>
            Included studies appear here once both reviewers have locked their
            extractions.
          </p>
        </div>
      ) : (
        view.studies.map((study) => (
          <ReconcileStudy
            key={study.study.id}
            reviewId={view.reviewId}
            study={study}
            canResolve={view.canResolve}
          />
        ))
      )}

      {!view.canResolve ? (
        <p className={styles.readonlyNote}>
          Read only — you can review the reconciliation but not record
          consensus.
        </p>
      ) : null}
    </>
  );
}

function ReconcileStudy({
  reviewId,
  study,
  canResolve,
}: {
  reviewId: string;
  study: ReconcileStudyDTO;
  canResolve: boolean;
}) {
  const shown = study.fields.filter((f) => f.reviewer1 || f.reviewer2 || f.ai);
  return (
    <section className={styles.studyCard}>
      <div className={styles.studyCardHead}>
        <div className={styles.formTitle}>{study.study.title}</div>
        <div className={styles.formMeta}>
          {[study.study.authors, study.study.year, study.study.journal]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {shown.map((field) => (
        <ReconcileField
          key={field.fieldId}
          reviewId={reviewId}
          studyId={study.study.id}
          field={field}
          canResolve={canResolve}
        />
      ))}
    </section>
  );
}

function ProvenanceLine({ provenance }: { provenance: ProvenanceDTO | null }) {
  if (!provenance) {
    return <span className={styles.noProv}>— no provenance</span>;
  }
  const parts = [
    provenance.reportId,
    provenance.page ? `p.${provenance.page}` : null,
    provenance.locator,
  ].filter(Boolean);
  return (
    <span className={styles.prov}>
      {parts.join(' · ') || '— no provenance'}
    </span>
  );
}

function ValueDisplay({ entry }: { entry: ReconcileEntryDTO }) {
  if (entry.state !== 'reported') {
    return (
      <span className={styles.dashedInline}>{stateLabel(entry.state)}</span>
    );
  }
  return (
    <span className={styles.valueText}>
      {entry.value}
      {entry.derived ? (
        <span
          className={styles.derivedTag}
          title={entry.derivedFormula ?? 'Derived'}
        >
          derived
        </span>
      ) : null}
    </span>
  );
}

function ReviewerColumn({
  entry,
  label,
  onPick,
  disabled,
}: {
  entry: ReconcileEntryDTO | null;
  label: string;
  onPick: (() => void) | null;
  disabled: boolean;
}) {
  return (
    <div className={styles.reviewerCell}>
      <div className={styles.reviewerName}>{entry?.reviewerName ?? label}</div>
      {entry ? (
        <>
          <ValueDisplay entry={entry} />
          <ProvenanceLine provenance={entry.provenance} />
          {onPick ? (
            <button
              type="button"
              className={styles.pickBtn}
              onClick={onPick}
              disabled={disabled}
            >
              Use this
            </button>
          ) : null}
        </>
      ) : (
        <span className={styles.dashedInline}>Not extracted</span>
      )}
    </div>
  );
}

function ReconcileField({
  reviewId,
  studyId,
  field,
  canResolve,
}: {
  reviewId: string;
  studyId: string;
  field: ReconcileFieldDTO;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [aiRevealed, setAiRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedState, setTypedState] = useState<ExtractionState>('reported');
  const [typedDerived, setTypedDerived] = useState(false);
  const [typedFormula, setTypedFormula] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [rationale, setRationale] = useState('');
  const [ladderOpen, setLadderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Something went wrong.');
    });
  };

  const pick = (entry: ReconcileEntryDTO) =>
    run(() =>
      resolveFieldAction(reviewId, {
        studyId,
        fieldId: field.fieldId,
        source: entry.slot,
        value: entry.value,
        state: entry.state,
        derived: entry.derived,
        derivedFormula: entry.derivedFormula,
        provenance: entry.provenance,
      }),
    );

  const pickTyped = () =>
    run(() =>
      resolveFieldAction(reviewId, {
        studyId,
        fieldId: field.fieldId,
        source: 'typed',
        value: typedState === 'reported' ? typed : null,
        state: typedState,
        derived: typedState === 'reported' && typedDerived,
        derivedFormula:
          typedState === 'reported' && typedDerived ? typedFormula : null,
        provenance: null,
      }),
    );

  const logContact = (contacted: boolean) =>
    run(() =>
      logAuthorContactAction(reviewId, {
        studyId,
        fieldId: field.fieldId,
        contacted,
        note: contactNote,
      }),
    );

  const park = () =>
    run(() =>
      leaveUnresolvedAction(reviewId, {
        studyId,
        fieldId: field.fieldId,
        authorContacted: field.consensus?.authorContacted ?? false,
        rationale,
      }),
    );

  const statusClass = field.agreed
    ? styles.fieldAgreed
    : field.final.kind === 'resolved'
      ? styles.fieldResolved
      : styles.fieldConflict;

  return (
    <div className={`${styles.reconField} ${statusClass}`}>
      <div className={styles.reconHead}>
        <span className={styles.reconLabel}>{field.label}</span>
        {field.agreed ? (
          <span className={styles.agreedTag}>
            <Check size={10} aria-hidden /> Agreed
          </span>
        ) : field.final.kind === 'resolved' ? (
          <span className={styles.resolvedTag}>
            <Check size={10} aria-hidden /> Resolved
          </span>
        ) : (
          <span className={styles.conflictTag}>Decision required</span>
        )}
        {field.qcFlagged ? (
          <span className={styles.qcTag} title="Sampled for a QC re-check">
            QC — verify against source
          </span>
        ) : null}
      </div>

      {/* Both extractions, EQUAL weight — no default/primary, neither pre-selected. */}
      <div
        className={styles.reviewerGrid}
        role="group"
        aria-label="Both reviewers' values, shown at equal weight"
      >
        <ReviewerColumn
          entry={field.reviewer1}
          label="Reviewer 1"
          onPick={
            canResolve && field.reviewer1 ? () => pick(field.reviewer1!) : null
          }
          disabled={pending}
        />
        <ReviewerColumn
          entry={field.reviewer2}
          label="Reviewer 2"
          onPick={
            canResolve && field.reviewer2 ? () => pick(field.reviewer2!) : null
          }
          disabled={pending}
        />
      </div>

      {/* Source passage + AI suggestion (hidden until the source is opened). */}
      {field.ai ? (
        <div className={styles.aiRow}>
          {!sourceOpen ? (
            <button
              type="button"
              className={styles.sourceBtn}
              onClick={() => setSourceOpen(true)}
            >
              <BookOpen size={12} aria-hidden /> Open source passage
            </button>
          ) : (
            <div className={styles.sourceBox}>
              <div className={styles.sourceQuote}>
                {field.ai.sourceQuote ??
                  'Source passage (open the report to verify).'}
              </div>
              {!aiRevealed ? (
                <button
                  type="button"
                  className={styles.aiRevealBtn}
                  onClick={() => setAiRevealed(true)}
                >
                  <Sparkles size={11} aria-hidden /> Show AI suggestion (after
                  you&apos;ve seen the source)
                </button>
              ) : (
                <div className={styles.aiCell}>
                  <div className={styles.aiHeadRow}>
                    <span className={styles.aiLabel}>
                      <Sparkles size={10} aria-hidden /> AI · derived from
                      source
                    </span>
                  </div>
                  <ValueDisplay entry={field.ai} />
                  {canResolve ? (
                    <button
                      type="button"
                      className={styles.pickBtn}
                      onClick={() => pick(field.ai!)}
                      disabled={pending}
                    >
                      Use AI value
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Consensus — empty until a human picks. */}
      <div className={styles.consensusRow}>
        <span className={styles.consensusLabel}>Consensus</span>
        {field.final.kind === 'conflict' ? (
          <span className={styles.consensusEmpty}>Empty — pick a value</span>
        ) : (
          <span className={styles.consensusValue}>
            {field.final.state === 'reported'
              ? field.final.value
              : stateLabel(field.final.state)}
            {field.consensus ? (
              <span className={styles.consensusMeta}>
                {' '}
                ·{' '}
                {field.consensus.resolutionMethod === 'arbitrator'
                  ? 'arbitrated'
                  : field.consensus.resolutionMethod === 'unresolved'
                    ? 'unresolved (recorded)'
                    : 'agreed'}
                {field.consensus.resolvedByName
                  ? ` · ${field.consensus.resolvedByName}`
                  : ''}
              </span>
            ) : null}
          </span>
        )}
      </div>

      {canResolve && !field.agreed ? (
        <div className={styles.typedBar}>
          <span className={styles.typedLabel}>Or record a value</span>
          {typedState === 'reported' ? (
            <input
              className={styles.typedInput}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Typed / calculated value"
              disabled={pending}
            />
          ) : null}
          <StatePicker
            value={typedState}
            onChange={setTypedState}
            disabled={pending}
            name={`consensus ${field.label}`}
          />
          {typedState === 'reported' ? (
            <label className={styles.derivedRow}>
              <input
                type="checkbox"
                checked={typedDerived}
                onChange={(e) => setTypedDerived(e.target.checked)}
                disabled={pending}
              />
              Derived
            </label>
          ) : null}
          {typedState === 'reported' && typedDerived ? (
            <input
              className={styles.formulaInput}
              value={typedFormula}
              onChange={(e) => setTypedFormula(e.target.value)}
              placeholder="Formula"
              disabled={pending}
            />
          ) : null}
          <button
            type="button"
            className={styles.recordBtn}
            onClick={pickTyped}
            disabled={pending}
          >
            Set consensus
          </button>
        </div>
      ) : null}

      {/* Resolution ladder — author-contact log + leave-unresolved. */}
      {canResolve && !field.agreed && field.final.kind !== 'resolved' ? (
        <div className={styles.ladder}>
          <button
            type="button"
            className={styles.ladderToggle}
            onClick={() => setLadderOpen((o) => !o)}
          >
            {ladderOpen ? 'Hide' : 'Escalate'} — author contact / leave
            unresolved
          </button>
          {ladderOpen ? (
            <div className={styles.ladderBody}>
              <div className={styles.ladderStep}>
                <span className={styles.ladderStepLabel}>
                  Author-contact log
                </span>
                <input
                  className={styles.typedInput}
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="Attempt + any response (never auto-sent)"
                  disabled={pending}
                />
                <button
                  type="button"
                  className={styles.ladderBtn}
                  onClick={() => logContact(true)}
                  disabled={pending}
                >
                  Log: contacted
                </button>
                <button
                  type="button"
                  className={styles.ladderBtn}
                  onClick={() => logContact(false)}
                  disabled={pending}
                >
                  Log: not contacted
                </button>
              </div>
              <div className={styles.ladderStep}>
                <span className={styles.ladderStepLabel}>Leave unresolved</span>
                <input
                  className={styles.typedInput}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Rationale (required to park)"
                  disabled={pending}
                />
                <button
                  type="button"
                  className={styles.ladderBtn}
                  onClick={park}
                  disabled={pending}
                >
                  Leave unresolved
                </button>
              </div>
              {field.consensus?.authorContacted ? (
                <div className={styles.contactNote}>
                  Authors contacted · {field.consensus.authorContactNote}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
