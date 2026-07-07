'use client';

import { useState, useTransition } from 'react';
import { Check, Lock, Pencil, Plus, X } from 'lucide-react';
import {
  amendProtocolAction,
  lockProtocolAction,
  saveDraftAction,
} from '@/lib/sr/protocol/actions';
import { PICO_FIELDS, SUGGESTED_CRITERIA } from '@/lib/sr/protocol/constants';
import type {
  EligibilityCriterion,
  Pico,
  ProtocolActionResult,
  ProtocolContent,
  ProtocolVersionDTO,
  ProtocolViewDTO,
} from '@/lib/sr/protocol/types';
import { CriterionEditor } from './criterion-editor';
import styles from './protocol-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// SR1 — the protocol / eligibility-criteria screen. PICO + inclusion/exclusion
// criteria with lock + dated amendments. Ported from the ScholarSync precursor
// (protocol-screen.tsx) and rewired from the in-memory store to persisted,
// versioned server actions. The frozen skin comes from protocol-screen.module.css.
// ─────────────────────────────────────────────────────────────────────────────

// ── immutable content operations ─────────────────────────────────────────────

function setResearchQuestion(
  content: ProtocolContent,
  researchQuestion: string,
): ProtocolContent {
  return { ...content, researchQuestion };
}

function setPicoField(
  content: ProtocolContent,
  key: keyof Pico,
  value: string,
): ProtocolContent {
  return { ...content, pico: { ...content.pico, [key]: value } };
}

function updateCriterion(
  content: ProtocolContent,
  id: string,
  patch: Partial<Omit<EligibilityCriterion, 'id'>>,
): ProtocolContent {
  return {
    ...content,
    criteria: content.criteria.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    ),
  };
}

function removeCriterion(
  content: ProtocolContent,
  id: string,
): ProtocolContent {
  return { ...content, criteria: content.criteria.filter((c) => c.id !== id) };
}

function addCriterion(
  content: ProtocolContent,
  draft: Omit<EligibilityCriterion, 'id'>,
): ProtocolContent {
  return {
    ...content,
    criteria: [...content.criteria, { ...draft, id: crypto.randomUUID() }],
  };
}

// Deterministic timestamp formatting from the ISO string (no locale/timezone
// drift → no hydration mismatch): "2026-07-02 · 12:30".
function formatStamp(iso: string): string {
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)}`;
}

interface ProtocolScreenProps {
  dto: ProtocolViewDTO;
  canEdit: boolean;
  authorNames?: Record<string, string>;
}

export function ProtocolScreen({
  dto,
  canEdit,
  authorNames = {},
}: ProtocolScreenProps) {
  const [view, setView] = useState<ProtocolViewDTO>(dto);
  const [content, setContent] = useState<ProtocolContent>(dto.content);
  const [amending, setAmending] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const locked = view.status === 'locked';
  const editable = canEdit && (!locked || amending);
  const hasCriteria = content.criteria.length > 0;

  function edit(next: ProtocolContent) {
    setContent(next);
    setDirty(true);
    setError(null);
  }

  function applyResult(result: ProtocolActionResult) {
    if (result.ok) {
      setView(result.view);
      setContent(result.view.content);
      setDirty(false);
      setError(null);
      setAmending(false);
      setReason('');
    } else {
      setError(result.message);
    }
  }

  function run(action: () => Promise<ProtocolActionResult>) {
    setError(null);
    startTransition(async () => {
      applyResult(await action());
    });
  }

  const handleSaveDraft = () =>
    run(() => saveDraftAction(view.reviewId, content));
  const handleLock = () =>
    run(() => lockProtocolAction(view.reviewId, content));
  const handleAmendSave = () =>
    run(() => amendProtocolAction(view.reviewId, content, reason));

  function openAmend() {
    setContent(view.content);
    setReason('');
    setError(null);
    setAmending(true);
  }

  function cancelAmend() {
    setContent(view.content);
    setReason('');
    setError(null);
    setDirty(false);
    setAmending(false);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.eyebrow}>Review settings · protocol</div>
      <h1 className={styles.title}>Eligibility criteria</h1>
      <p className={styles.lead}>
        Your eligibility criteria drive the whole review: the locked protocol is
        what every screening decision and the <b>PRISMA</b> counts are judged
        against. Draft your <b>PICO</b> and inclusion/exclusion criteria, then{' '}
        <b>lock</b> the protocol. After locking, every change is a{' '}
        <b>dated amendment with a reason</b> — the methodological record is
        never silently overwritten.
      </p>

      <div className={styles.badgeRow}>
        {locked ? (
          <span className={`${styles.pill} ${styles.pillLocked}`}>
            <Lock size={11} aria-hidden />
            Locked ·{' '}
            <span className={styles.versionTag}>v{view.currentVersion}</span>
          </span>
        ) : (
          <span className={`${styles.pill} ${styles.pillDraft}`}>
            {view.status === 'empty' ? 'Not started' : 'Draft — not yet locked'}
          </span>
        )}
      </div>

      {!canEdit ? (
        <p className={styles.readNote}>
          Read only — only the review owner and collaborators can edit, lock, or
          amend the protocol.
        </p>
      ) : null}

      {error ? (
        <p className={styles.errorNote} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.sectionLabel}>
        Research question <span className={styles.rule} />
      </div>
      {editable ? (
        <textarea
          className={styles.rqInput}
          aria-label="Research question"
          rows={2}
          placeholder="e.g. In adults with heart failure, do SGLT2 inhibitors reduce…"
          value={content.researchQuestion}
          onChange={(event) =>
            edit(setResearchQuestion(content, event.target.value))
          }
        />
      ) : (
        <p
          className={`${styles.readValue}${
            view.content.researchQuestion ? '' : ` ${styles.readValueMuted}`
          }`}
        >
          {view.content.researchQuestion || 'No research question recorded.'}
        </p>
      )}

      <div className={styles.sectionLabel}>
        PICO <span className={styles.rule} />
      </div>
      {editable ? (
        <div className={styles.picoGrid}>
          {PICO_FIELDS.map((field) => (
            <label className={styles.picoField} key={field.key}>
              <span className={styles.picoLabel}>{field.label}</span>
              <input
                className={styles.picoInput}
                aria-label={field.label}
                value={content.pico[field.key]}
                placeholder={field.hint}
                onChange={(event) =>
                  edit(setPicoField(content, field.key, event.target.value))
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <div className={styles.picoGrid}>
          {PICO_FIELDS.map((field) => (
            <div className={styles.picoField} key={field.key}>
              <span className={styles.picoLabel}>{field.label}</span>
              <span
                className={`${styles.readValue}${
                  view.content.pico[field.key]
                    ? ''
                    : ` ${styles.readValueMuted}`
                }`}
              >
                {view.content.pico[field.key] || '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionLabel}>
        Eligibility criteria <span className={styles.rule} />
      </div>
      {editable ? (
        <div className={styles.critCols}>
          <EditableCriteriaColumn
            title="Inclusion"
            kind="include"
            content={content}
            onChange={edit}
          />
          <EditableCriteriaColumn
            title="Exclusion"
            kind="exclude"
            content={content}
            onChange={edit}
          />
        </div>
      ) : (
        <div className={styles.critCols}>
          <ReadOnlyCriteriaColumn
            title="Inclusion criteria"
            kind="include"
            variant={styles.readCritInc}
            criteria={view.content.criteria}
          />
          <ReadOnlyCriteriaColumn
            title="Exclusion criteria"
            kind="exclude"
            variant={styles.readCritExc}
            criteria={view.content.criteria}
          />
        </div>
      )}

      {canEdit && amending ? (
        <div className={styles.amendBox} style={{ marginTop: 20 }}>
          <div className={styles.amendTitle}>Amendment reason</div>
          <p className={styles.amendHint}>
            Recorded in the dated amendment history as version{' '}
            {(view.currentVersion ?? 1) + 1}. Explain what changed and why.
          </p>
          <textarea
            className={styles.reasonInput}
            aria-label="Reason for amendment"
            rows={2}
            placeholder="e.g. Widened to include HFpEF after the scoping search."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      ) : null}

      {canEdit ? (
        <div className={styles.btnRow}>
          {locked && !amending ? (
            <button
              type="button"
              className={styles.btn}
              onClick={openAmend}
              disabled={isPending}
            >
              <Pencil size={13} aria-hidden />
              Amend protocol
            </button>
          ) : null}

          {!locked ? (
            <>
              <button
                type="button"
                className={styles.btn}
                onClick={handleSaveDraft}
                disabled={isPending || !dirty}
              >
                Save draft
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleLock}
                disabled={isPending || !hasCriteria}
                title={
                  hasCriteria
                    ? undefined
                    : 'Add at least one eligibility criterion before locking.'
                }
              >
                <Lock size={13} aria-hidden />
                Lock protocol
              </button>
            </>
          ) : null}

          {amending ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleAmendSave}
                disabled={
                  isPending || reason.trim().length === 0 || !hasCriteria
                }
              >
                <Check size={13} aria-hidden />
                Save amendment
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={cancelAmend}
                disabled={isPending}
              >
                <X size={13} aria-hidden />
                Cancel
              </button>
            </>
          ) : null}

          {!locked && dirty ? (
            <span className={`${styles.saveState} ${styles.saveStateDirty}`}>
              Unsaved changes
            </span>
          ) : null}
        </div>
      ) : null}

      {view.versions.length > 0 ? (
        <>
          <div className={styles.sectionLabel}>
            Amendment history <span className={styles.rule} />
          </div>
          <AmendmentHistory
            versions={view.versions}
            authorNames={authorNames}
          />
        </>
      ) : null}
    </div>
  );
}

// ── editable criteria column (drafting / amending) ───────────────────────────

function EditableCriteriaColumn({
  title,
  kind,
  content,
  onChange,
}: {
  title: string;
  kind: 'include' | 'exclude';
  content: ProtocolContent;
  onChange: (next: ProtocolContent) => void;
}) {
  const rows = content.criteria.filter((c) => c.kind === kind);
  const existing = new Set(content.criteria.map((c) => c.label));
  const suggestions = SUGGESTED_CRITERIA.filter(
    (c) => c.kind === kind && !existing.has(c.label),
  );

  return (
    <div className={styles.critCol}>
      <div className={styles.critColHead}>{title}</div>
      {rows.map((criterion) => (
        <CriterionEditor
          key={criterion.id}
          criterion={criterion}
          onChange={(patch) =>
            onChange(updateCriterion(content, criterion.id, patch))
          }
          onRemove={() => onChange(removeCriterion(content, criterion.id))}
        />
      ))}
      <div className={styles.suggested}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className={styles.suggChip}
            onClick={() => onChange(addCriterion(content, suggestion))}
          >
            <Plus size={11} aria-hidden /> {suggestion.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.suggChip}
          onClick={() =>
            onChange(
              addCriterion(content, {
                kind,
                label: `New ${kind === 'include' ? 'inclusion' : 'exclusion'} criterion`,
                instruction: '',
                answerStructure: 'yes_no_maybe',
              }),
            )
          }
        >
          <Plus size={11} aria-hidden /> Add criterion
        </button>
      </div>
    </div>
  );
}

// ── read-only criteria column (locked view) ──────────────────────────────────

function ReadOnlyCriteriaColumn({
  title,
  kind,
  variant,
  criteria,
}: {
  title: string;
  kind: 'include' | 'exclude';
  variant: string;
  criteria: EligibilityCriterion[];
}) {
  const rows = criteria.filter((c) => c.kind === kind);
  return (
    <div className={`${styles.readCrit} ${variant}`}>
      <div className={styles.readCritHead}>{title}</div>
      {rows.length === 0 ? (
        <div className={styles.readCritEmpty}>None.</div>
      ) : (
        rows.map((criterion) => (
          <div key={criterion.id} className={styles.readCritItem}>
            {criterion.label}
            {criterion.instruction ? (
              <div className={styles.readCritInstruction}>
                {criterion.instruction}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

// ── amendment history (newest first) ─────────────────────────────────────────

function AmendmentHistory({
  versions,
  authorNames,
}: {
  versions: ProtocolVersionDTO[];
  authorNames: Record<string, string>;
}) {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className={styles.history}>
      {ordered.map((version) => {
        const author = version.lockedBy ? authorNames[version.lockedBy] : null;
        return (
          <div key={version.version} className={styles.historyItem}>
            <div className={styles.historyHead}>
              <span className={styles.historyVersion}>v{version.version}</span>
              <span className={styles.historyMeta}>
                {formatStamp(version.lockedAt)}
                {author ? ` · ${author}` : ''}
              </span>
              {version.reason === null ? (
                <span className={styles.historyBaseline}>Baseline lock</span>
              ) : null}
            </div>
            {version.reason ? (
              <p className={styles.historyReason}>
                <b>Reason:</b> {version.reason}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
