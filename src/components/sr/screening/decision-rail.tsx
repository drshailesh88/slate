'use client';

import { useState } from 'react';
import { Check, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { EXCLUDE_REASONS } from '@/lib/sr/screening/exclude-reasons';
import type {
  OwnDecisionDTO,
  ScreeningCriteriaDTO,
  ScreeningDecisionKind,
  ScreeningProgressDTO,
} from '@/lib/sr/screening/types';
import { VoteTriad } from './vote-triad';
import styles from './screening-screen.module.css';

// The right zone — YOUR decision only. It carries a persistent blind banner, the
// protocol criteria checklist you assess against, the I/M/E triad, an exclusion
// reason (preset + note), the AI-order toggle (labeled, off by default), and the
// blinding-safe progress. There is NOTHING here that can show a co-reviewer's
// vote, the AI's verdict, or an AI relevance score — by design (FOUNDATION §10).

export interface DecisionRailProps {
  canScreen: boolean;
  finished: boolean;
  ownDecision?: OwnDecisionDTO;
  onVote: (decision: ScreeningDecisionKind) => void;
  onExcludeReasonChange: (code: string | null, detail: string | null) => void;
  criteria: ScreeningCriteriaDTO;
  progress: ScreeningProgressDTO;
  useAiOrder: boolean;
  aiOrderAvailable: boolean;
  onToggleAiOrder: (on: boolean) => void;
  pending: boolean;
}

function CriteriaBlock({ criteria }: { criteria: ScreeningCriteriaDTO }) {
  if (criteria.include.length === 0 && criteria.exclude.length === 0) {
    return (
      <p className={styles.railNote}>
        No locked protocol criteria yet — lock the protocol to guide screening.
      </p>
    );
  }
  return (
    <div className={styles.criteria}>
      {criteria.include.length > 0 ? (
        <div className={`${styles.critBox} ${styles.critInclude}`}>
          <h4>Include if</h4>
          <ul>
            {criteria.include.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {criteria.exclude.length > 0 ? (
        <div className={`${styles.critBox} ${styles.critExclude}`}>
          <h4>Exclude if</h4>
          <ul>
            {criteria.exclude.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ExcludeReason({
  ownDecision,
  onExcludeReasonChange,
  pending,
}: {
  ownDecision?: OwnDecisionDTO;
  onExcludeReasonChange: (code: string | null, detail: string | null) => void;
  pending: boolean;
}) {
  // Seeded once per study — the parent remounts this via a `key` on studyId, so
  // the note resets when the current study changes (no reset-in-effect).
  const [note, setNote] = useState(ownDecision?.excludeReasonDetail ?? '');

  const code = ownDecision?.excludeReasonCode ?? '';

  return (
    <div className={styles.excludeReason}>
      <label className={styles.railSubhead} htmlFor="exclude-reason-code">
        Exclusion reason
      </label>
      <select
        id="exclude-reason-code"
        className={styles.reasonSelect}
        value={code}
        disabled={pending}
        onChange={(event) =>
          onExcludeReasonChange(event.target.value || null, note.trim() || null)
        }
      >
        <option value="">Reason (optional)…</option>
        {EXCLUDE_REASONS.map((reason) => (
          <option key={reason.code} value={reason.code}>
            {reason.label}
          </option>
        ))}
      </select>
      <textarea
        className={styles.reasonNote}
        placeholder="Add a note (optional)"
        value={note}
        disabled={pending}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => onExcludeReasonChange(code || null, note.trim() || null)}
      />
    </div>
  );
}

export function DecisionRail(props: DecisionRailProps) {
  const {
    canScreen,
    finished,
    ownDecision,
    onVote,
    onExcludeReasonChange,
    criteria,
    progress,
    useAiOrder,
    aiOrderAvailable,
    onToggleAiOrder,
    pending,
  } = props;

  return (
    <aside className={styles.rail}>
      <div className={styles.blindBanner} role="status">
        <span className={styles.blindDot} aria-hidden />
        <span>
          <b>Independent screening</b>
          <br />
          Decisions are hidden until every reviewer finishes.
        </span>
      </div>

      {canScreen ? (
        <>
          <div className={styles.railSubhead}>Your decision</div>
          <VoteTriad
            selected={ownDecision?.decision}
            onVote={onVote}
            disabled={pending || finished}
          />
          {ownDecision?.decision === 'exclude' && !finished ? (
            <ExcludeReason
              key={ownDecision.studyId}
              ownDecision={ownDecision}
              onExcludeReasonChange={onExcludeReasonChange}
              pending={pending}
            />
          ) : null}
          <p className={styles.railNote}>
            Maybe is a positive call — it advances the study. Your decision is
            the record; revise it any time until you finish.
          </p>
        </>
      ) : (
        <p className={styles.railNote}>
          You have read-only access to this screening surface.
        </p>
      )}

      <div className={styles.railSubhead}>Protocol criteria</div>
      <CriteriaBlock criteria={criteria} />

      <div className={styles.aiLine}>
        <span className={styles.aiChip}>
          <Sparkles size={11} aria-hidden /> AI
        </span>
        <span>
          The AI reviewer screens as a blinded member. Its calls and reasoning
          appear only at reconciliation — never during independent screening.
        </span>
      </div>

      <div className={styles.aiOrder}>
        <label className={styles.aiOrderToggle}>
          <input
            type="checkbox"
            checked={useAiOrder}
            disabled={!aiOrderAvailable || pending}
            onChange={(event) => onToggleAiOrder(event.target.checked)}
          />
          <span>AI-suggested order</span>
        </label>
        <p className={styles.railNote}>
          {aiOrderAvailable
            ? 'Reorders your queue by AI-predicted relevance. It only orders — it never shows a verdict or score.'
            : 'Available once the AI reviewer is set up. It will only reorder the queue — never show a verdict or score.'}
        </p>
      </div>

      <div className={styles.progress}>
        <ShieldCheck size={12} aria-hidden />
        <span className={styles.progressCount}>
          {progress.finishedReviewers} of {progress.totalReviewers}
        </span>
        <span>reviewers finished</span>
      </div>

      {finished ? (
        <div className={styles.finishedTag}>
          <Lock size={12} aria-hidden /> You have finished — your decisions are
          locked.
        </div>
      ) : null}

      {canScreen && !finished && (ownDecision?.decision ?? null) ? (
        <div className={styles.savedTag}>
          <Check size={12} aria-hidden /> Saved
        </div>
      ) : null}
    </aside>
  );
}
