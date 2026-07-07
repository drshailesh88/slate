'use client';

import { useRef, useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Sparkles, Undo2, Upload } from 'lucide-react';
import type {
  DupeQueueEntry,
  ImportTarget,
  LedgerBatch,
} from '@/lib/sr/import';
import type { ImportState, UndoneBatch } from '@/lib/sr/import-service';
import {
  runImport,
  runMarkNotDuplicate,
  runMerge,
  runRestoreImport,
  runUndoImport,
  type ImportActionResult,
} from '@/app/(app)/systematic-review/[reviewId]/import/actions';
import styles from './import-screen.module.css';

type ImportFormatOption = 'ris' | 'csv' | 'pubmed';

const FORMAT_OPTIONS: { value: ImportFormatOption; label: string }[] = [
  { value: 'ris', label: 'RIS / EndNote (.ris)' },
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'pubmed', label: 'PubMed IDs (PMID list)' },
];

const TARGET_OPTIONS: { value: ImportTarget; label: string }[] = [
  { value: 'screen', label: 'Title & abstract' },
  { value: 'full_text', label: 'Full-text review' },
];

function LedgerCard({
  batch,
  canManage,
  pending,
  onUndo,
}: {
  batch: LedgerBatch;
  canManage: boolean;
  pending: boolean;
  onUndo: () => void;
}) {
  const label = batch.ai
    ? 'Added via AI search'
    : batch.target === 'screen'
      ? 'Added to Title & abstract'
      : 'Added to Full-text review';

  return (
    <div className={styles.ledgerCard}>
      <span
        className={
          batch.ai ? `${styles.stageTag} ${styles.stageTagAi}` : styles.stageTag
        }
      >
        {label}
      </span>
      <div className={styles.nums}>
        <div>
          <div className={styles.num}>{batch.refs}</div>
          <div className={styles.numLabel}>References</div>
        </div>
        <div>
          <div className={styles.num}>{batch.duplicatesRemoved}</div>
          <div className={styles.numLabel}>Duplicates</div>
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span>{batch.source}</span>
        {canManage && (
          <button
            type="button"
            className={styles.undoBtn}
            onClick={onUndo}
            disabled={pending}
          >
            Undo import
          </button>
        )}
      </div>
    </div>
  );
}

function DupeCard({
  entry,
  canManage,
  pending,
  onMerge,
  onKeep,
}: {
  entry: DupeQueueEntry;
  canManage: boolean;
  pending: boolean;
  onMerge: () => void;
  onKeep: () => void;
}) {
  const { candidate, matchedOn } = entry;
  const firstAuthor = candidate.authors[0]?.split(' ')[0];
  const year = candidate.year ? `${candidate.year} · ` : '';

  return (
    <div className={styles.dupeCard}>
      <span className={styles.dupePill}>
        <Copy size={11} aria-hidden /> Possible duplicate
      </span>
      <div className={styles.dupeBody}>
        <div className={styles.dupeTitle}>
          {firstAuthor ? `${firstAuthor} · ` : ''}
          {year}
          {candidate.title}
        </div>
        <div className={styles.dupeMeta}>
          Matched on{' '}
          {matchedOn.length ? matchedOn.join(' + ') : 'a prior record'}
        </div>
      </div>
      {canManage && (
        <div className={styles.dupeActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onKeep}
            disabled={pending}
          >
            Not a duplicate
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onMerge}
            disabled={pending}
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
}

// Screen 2 — the import form, the reversible ledger, and the uncertain-duplicate
// queue. Server-side persistence via the import actions; this shell renders the
// chokepoint-safe (non-blinded) study data the page loaded.
export function ImportScreen({
  reviewId,
  canManage,
  state,
}: {
  reviewId: string;
  canManage: boolean;
  state: ImportState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [format, setFormat] = useState<ImportFormatOption>('ris');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState<ImportTarget>('screen');
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { ledger, queue, undoneBatches } = state;

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!source) setSource(file.name);
    void file.text().then(setText);
  }

  function summarize(result: ImportActionResult): string {
    const parts = [`Imported ${result.imported}`];
    if (result.duplicates) parts.push(`${result.duplicates} auto-merged`);
    if (result.needsReview) parts.push(`${result.needsReview} to review`);
    if (result.skipped) parts.push(`${result.skipped} skipped`);
    return `${parts.join(' · ')}.`;
  }

  function submitImport() {
    setFeedback(null);
    startTransition(async () => {
      const result = await runImport({
        reviewId,
        format,
        source,
        target,
        text,
      });
      if (result.ok) {
        setText('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setFeedback({ ok: true, message: summarize(result) });
        router.refresh();
      } else {
        setFeedback({ ok: false, message: result.error ?? 'Import failed.' });
      }
    });
  }

  function runStudyAction(
    action: (r: string, s: string) => Promise<{ ok: boolean; error?: string }>,
    studyId: string,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action(reviewId, studyId);
      if (result.ok) router.refresh();
      else
        setFeedback({ ok: false, message: result.error ?? 'Action failed.' });
    });
  }

  function runBatchAction(
    action: (r: string, b: string) => Promise<{ ok: boolean; error?: string }>,
    batchId: string,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action(reviewId, batchId);
      if (result.ok) router.refresh();
      else
        setFeedback({ ok: false, message: result.error ?? 'Action failed.' });
    });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.eyebrow}>Stage 1 · The funnel</div>
      <h1 className={styles.title}>Import references</h1>
      <p className={styles.lead}>
        You import your own search results (RIS / EndNote / PubMed / CSV) into a
        chosen stage; Slate auto-deduplicates on title · year · authors ·
        identifiers and keeps a reversible ledger. AI discovery can feed this
        queue — but import, dedupe and provenance are the system of record.{' '}
        <strong>There is no search-strategy builder</strong> — you arrive with
        your results.
      </p>

      <div className={styles.aiStrip}>
        <span className={styles.aiChip}>
          <Sparkles size={10} aria-hidden /> AI
        </span>
        <span>
          <strong>Find papers with AI</strong> — ask a research question, AI
          retrieves candidates → they flow into this import queue (deduped like
          any other source).
        </span>
      </div>

      {canManage && (
        <>
          <div className={styles.sectionLabel}>Import references</div>
          <div className={styles.panel}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="import-format">
                  Format
                </label>
                <select
                  id="import-format"
                  className={styles.select}
                  value={format}
                  onChange={(e) =>
                    setFormat(e.target.value as ImportFormatOption)
                  }
                >
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="import-target">
                  Import into
                </label>
                <select
                  id="import-target"
                  className={styles.select}
                  value={target}
                  onChange={(e) => setTarget(e.target.value as ImportTarget)}
                >
                  {TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label className={styles.fieldLabel} htmlFor="import-source">
                  Source label{' '}
                  <span className={styles.formats}>(optional)</span>
                </label>
                <input
                  id="import-source"
                  className={styles.input}
                  value={source}
                  placeholder="e.g. PubMed, Embase, Cochrane CENTRAL"
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label className={styles.fieldLabel} htmlFor="import-text">
                  Paste references{' '}
                  <span className={styles.formats}>
                    {format === 'pubmed'
                      ? '— one PMID per line'
                      : '— or upload a file below'}
                  </span>
                </label>
                <textarea
                  id="import-text"
                  className={styles.textarea}
                  value={text}
                  placeholder={
                    format === 'pubmed'
                      ? '31535829\n32865377\n…'
                      : format === 'csv'
                        ? 'Title,Authors,Year,DOI,Journal,PMID\n…'
                        : 'TY  - JOUR\nTI  - …\nER  -'
                  }
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.formFooter}>
              <label className={styles.ghostBtn}>
                <Upload
                  size={13}
                  aria-hidden
                  style={{ verticalAlign: '-2px', marginRight: 6 }}
                />
                Choose file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ris,.txt,.csv,.nbib,.enw"
                  hidden
                  onChange={onFile}
                />
              </label>
              <div className={styles.spacer} />
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={submitImport}
                disabled={pending || !text.trim()}
              >
                {pending ? 'Importing…' : 'Import references'}
              </button>
            </div>
            {feedback && (
              <div
                className={
                  feedback.ok
                    ? styles.feedback
                    : `${styles.feedback} ${styles.feedbackError}`
                }
              >
                {feedback.message}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.sectionLabel}>
        Import history
        <span className={styles.sectionCount}>
          {ledger.totalDuplicatesRemoved} total duplicates removed
        </span>
      </div>
      {ledger.batches.length === 0 ? (
        <div className={styles.empty}>
          <h3>Nothing imported yet</h3>
          <p>
            Import search results from PubMed, Embase, EndNote or a RIS/CSV file
            — or let AI discovery feed this queue. Every import is reversible.
          </p>
        </div>
      ) : (
        <div className={styles.ledger}>
          {ledger.batches.map((batch) => (
            <LedgerCard
              key={batch.id}
              batch={batch}
              canManage={canManage}
              pending={pending}
              onUndo={() => runBatchAction(runUndoImport, batch.id)}
            />
          ))}
        </div>
      )}

      {undoneBatches.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {undoneBatches.map((batch: UndoneBatch) => (
            <div key={batch.id} className={styles.undoneRow}>
              <span>
                Import undone —{' '}
                <span className={styles.undoneSource}>{batch.source}</span> (
                {batch.refs} references, kept)
              </span>
              <div className={styles.spacer} />
              {canManage && (
                <button
                  type="button"
                  className={styles.undoBtn}
                  onClick={() => runBatchAction(runRestoreImport, batch.id)}
                  disabled={pending}
                >
                  <Undo2
                    size={12}
                    aria-hidden
                    style={{ verticalAlign: '-2px', marginRight: 4 }}
                  />
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionLabel}>Duplicate queue</div>
      {queue.length === 0 ? (
        <p className={styles.queueEmpty}>
          No uncertain duplicates — everything the matcher was confident about
          was removed automatically (and is reversible from the ledger).
        </p>
      ) : (
        <div className={styles.queue}>
          {queue.map((entry) => (
            <DupeCard
              key={entry.candidate.id}
              entry={entry}
              canManage={canManage}
              pending={pending}
              onMerge={() => runStudyAction(runMerge, entry.candidate.id)}
              onKeep={() =>
                runStudyAction(runMarkNotDuplicate, entry.candidate.id)
              }
            />
          ))}
        </div>
      )}

      {!canManage && (
        <p className={styles.note}>
          You have read-only access to imports. Only the review owner and
          collaborators can import references or resolve duplicates.
        </p>
      )}
    </div>
  );
}
