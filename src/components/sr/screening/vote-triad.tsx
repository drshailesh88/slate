'use client';

import type { ScreeningDecisionKind } from '@/lib/sr/screening/types';
import styles from './screening-screen.module.css';

// Include / Maybe / Exclude — the decision commit. Rebuilt from the precursor's
// vote-triad with the blinding hole removed: there is NO `suggestion` prop. The
// AI's verdict is blinded like a human's, so nothing here rings, pre-selects, or
// hints a decision. Decision colors are the one place saturated colour lives
// (design.md §6): Include Jade · Maybe Amber · Exclude Tomato. Keys I / M / E.

interface VoteTriadProps {
  /** The reviewer's OWN committed decision, if any. Never a co-reviewer/AI call. */
  selected?: ScreeningDecisionKind;
  onVote: (decision: ScreeningDecisionKind) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  decision: ScreeningDecisionKind;
  label: string;
  key: string;
  className: string;
}> = [
  { decision: 'include', label: 'Include', key: 'I', className: styles.voteInclude },
  { decision: 'maybe', label: 'Maybe', key: 'M', className: styles.voteMaybe },
  { decision: 'exclude', label: 'Exclude', key: 'E', className: styles.voteExclude },
];

export function VoteTriad({ selected, onVote, disabled }: VoteTriadProps) {
  return (
    <div className={styles.votes}>
      {OPTIONS.map((option) => {
        const isSelected = selected === option.decision;
        return (
          <button
            key={option.decision}
            type="button"
            className={`${styles.vote} ${option.className} ${
              isSelected ? styles.voteSelected : ''
            }`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onVote(option.decision)}
          >
            <span className={styles.voteLabel}>{option.label}</span>
            <span className={styles.voteKey} aria-hidden>
              {option.key}
            </span>
          </button>
        );
      })}
    </div>
  );
}
