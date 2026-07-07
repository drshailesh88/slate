'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Gavel, HelpCircle, ShieldAlert, X } from 'lucide-react';
import { resolveConflictAction } from '@/app/(app)/systematic-review/[reviewId]/conflicts/actions';
import type {
  ConflictItemDTO,
  ConflictResolutionDTO,
  ConflictsViewDTO,
  EligibleArbitratorDTO,
  ResolveConflictInput,
} from '@/lib/sr/conflicts/types';
import styles from './conflicts-screen.module.css';

// Screen 5 — post-unblind conflict adjudication (T13). The two opposing screening
// calls are shown at EQUAL visual weight (no default "primary"); every conflict
// renders fully expanded (never auto-collapsed); nothing resolves without an
// explicit human action. Pre-unblind the server withholds the data entirely and
// this renders the blinded "withheld" state below — the opposing calls never
// reach the client.

function kappaText(kappa: ConflictsViewDTO['kappa']): string {
  return kappa.value === null
    ? `κ — ${kappa.label}`
    : `κ ${kappa.value.toFixed(2)} · ${kappa.label}`;
}

function DecisionChip({ decision }: { decision: string }) {
  if (decision === 'include') {
    return (
      <span className={`${styles.chip} ${styles.chipInc}`}>
        <Check size={12} aria-hidden /> Include
      </span>
    );
  }
  if (decision === 'exclude') {
    return (
      <span className={`${styles.chip} ${styles.chipExc}`}>
        <X size={12} aria-hidden /> Exclude
      </span>
    );
  }
  return (
    <span className={`${styles.chip} ${styles.chipMay}`}>
      <HelpCircle size={12} aria-hidden /> Maybe
    </span>
  );
}

function ResolvedBanner({ resolution }: { resolution: ConflictResolutionDTO }) {
  const detail =
    resolution.method === 'align_on_one'
      ? `Aligned on ${resolution.decision === 'include' ? 'Include' : 'Exclude'}`
      : `Sent to arbitrator${resolution.arbitratorName ? ` · ${resolution.arbitratorName}` : ''}`;
  return (
    <div className={styles.resolved}>
      <Check size={13} aria-hidden />
      <span>
        <b>Resolved</b> · {detail}
        {resolution.resolvedByName ? ` · by ${resolution.resolvedByName}` : ''}
      </span>
    </div>
  );
}

function ConflictCard({
  reviewId,
  item,
  canResolve,
  arbitrators,
}: {
  reviewId: string;
  item: ConflictItemDTO;
  canResolve: boolean;
  arbitrators: EligibleArbitratorDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [arbitratorId, setArbitratorId] = useState(
    arbitrators[0]?.userId ?? '',
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(partial: Omit<ResolveConflictInput, 'studyId' | 'note'>) {
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictAction(reviewId, {
        studyId: item.studyId,
        note: note.trim() || undefined,
        ...partial,
      });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  const meta = [
    item.authors,
    item.year ? String(item.year) : null,
    item.journal,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.studyTitle}>{item.title}</div>
        {meta ? <div className={styles.studyMeta}>{meta}</div> : null}
      </div>

      {/* Both opposing calls, EQUAL weight — same cell class, no primary/selected. */}
      <div
        className={styles.decisions}
        role="group"
        aria-label="Opposing screening decisions, shown at equal weight"
      >
        {item.decisions.map((d, i) => (
          <div className={styles.decisionCell} key={`${d.reviewerId}-${i}`}>
            <div className={styles.reviewer}>
              {d.isAi ? 'AI reviewer' : (d.reviewerName ?? 'Reviewer')}
              {d.isAi ? <span className={styles.aiTag}>AI</span> : null}
            </div>
            <DecisionChip decision={d.decision} />
            {d.excludeReasonDetail ? (
              <div className={styles.reason}>{d.excludeReasonDetail}</div>
            ) : null}
          </div>
        ))}
      </div>

      {item.resolution ? <ResolvedBanner resolution={item.resolution} /> : null}

      {canResolve ? (
        <div className={styles.resolveBar}>
          <div className={styles.resolveGroup}>
            <span className={styles.resolveLabel}>Align on one</span>
            <button
              type="button"
              className={`${styles.pickBtn} ${styles.pickInc}`}
              disabled={pending}
              onClick={() =>
                submit({ method: 'align_on_one', decision: 'include' })
              }
            >
              Include
            </button>
            <button
              type="button"
              className={`${styles.pickBtn} ${styles.pickExc}`}
              disabled={pending}
              onClick={() =>
                submit({ method: 'align_on_one', decision: 'exclude' })
              }
            >
              Exclude
            </button>
          </div>

          <div className={styles.resolveGroup}>
            <span className={styles.resolveLabel}>Send to arbitrator</span>
            {arbitrators.length === 0 ? (
              <span className={styles.noArb}>
                No arbitrator assigned — add one in Team.
              </span>
            ) : (
              <>
                <select
                  className={styles.select}
                  value={arbitratorId}
                  onChange={(e) => setArbitratorId(e.target.value)}
                  disabled={pending}
                  aria-label="Choose an arbitrator"
                >
                  {arbitrators.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.name ?? 'Arbitrator'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.arbBtn}
                  disabled={pending || !arbitratorId}
                  onClick={() =>
                    submit({ method: 'send_to_arbitrator', arbitratorId })
                  }
                >
                  <Gavel size={12} aria-hidden /> Send
                </button>
              </>
            )}
          </div>

          <input
            className={styles.note}
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            aria-label="Resolution note"
          />

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ConflictsScreen({ dto }: { dto: ConflictsViewDTO }) {
  const openCount = dto.conflicts.filter((c) => c.resolution === null).length;
  const resolvedCount = dto.conflicts.length - openCount;

  return (
    <div className={styles.screen}>
      <div className={styles.eyebrow}>Stage 3 · The funnel</div>
      <h1 className={styles.title}>Resolve conflicts</h1>
      <p className={styles.lead}>
        After unblinding, studies where reviewers disagreed (one <b>Include</b>{' '}
        vs one <b>Exclude</b>) surface here. Both calls are shown at{' '}
        <b>equal weight</b> — you record the agreed decision or send it to an
        independent arbitrator. Nothing is resolved automatically.
      </p>

      {dto.state === 'withheld' ? (
        <div className={styles.stateBlock}>
          <div className={styles.blindPill}>
            <ShieldAlert size={11} aria-hidden /> Blinded
          </div>
          <h3 className={styles.stateTitle}>Conflicts open after unblind</h3>
          <p className={styles.stateBody}>
            While screening is independent, every reviewer&apos;s calls stay
            hidden — opposing decisions and inter-rater agreement appear here
            only once the owner reveals decisions for reconciliation. This
            protects the review from correlated errors.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.statRow}>
            <span
              className={styles.kappaPill}
              title="Cohen's κ — inter-rater agreement"
            >
              {kappaText(dto.kappa)}
            </span>
            {dto.conflicts.length > 0 ? (
              <span className={styles.countPill}>
                {openCount} open · {resolvedCount} resolved
              </span>
            ) : null}
          </div>

          {dto.conflicts.length === 0 ? (
            <div className={styles.stateBlock}>
              <h3 className={styles.stateTitle}>No conflicts to resolve</h3>
              <p className={styles.stateBody}>
                Every screening call aligned. Inter-rater agreement:{' '}
                {kappaText(dto.kappa)}.
              </p>
            </div>
          ) : (
            <div className={styles.list}>
              {dto.conflicts.map((item) => (
                <ConflictCard
                  key={item.studyId}
                  reviewId={dto.reviewId}
                  item={item}
                  canResolve={dto.canResolve}
                  arbitrators={dto.eligibleArbitrators}
                />
              ))}
            </div>
          )}

          {!dto.canResolve && dto.conflicts.length > 0 ? (
            <p className={styles.readonlyNote}>
              Read only — you can review the conflicts but not record
              resolutions.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
