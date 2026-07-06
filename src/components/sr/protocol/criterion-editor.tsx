'use client';

import { Trash2 } from 'lucide-react';
import type {
  AnswerStructure,
  EligibilityCriterion,
} from '@/lib/sr/protocol/types';
import styles from './protocol-screen.module.css';

// Ported from the ScholarSync precursor (criterion-editor.tsx): Elicit's
// "column-as-a-question" — name + instruction + answer structure. Re-expressed
// in the frozen skin (CSS-module classes, tokens only, Lucide icon).

const ANSWER_STRUCTURES: Array<{ value: AnswerStructure; label: string }> = [
  { value: 'any', label: 'Any answer' },
  { value: 'specified', label: 'Specified' },
  { value: 'yes_no_maybe', label: 'Yes / No / Maybe' },
];

interface CriterionEditorProps {
  criterion: EligibilityCriterion;
  onChange: (patch: Partial<Omit<EligibilityCriterion, 'id'>>) => void;
  onRemove: () => void;
}

export function CriterionEditor({
  criterion,
  onChange,
  onRemove,
}: CriterionEditorProps) {
  return (
    <div className={styles.critEdit}>
      <div className={styles.critEditHead}>
        <input
          className={styles.critName}
          aria-label="Criterion name"
          value={criterion.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
        <button
          type="button"
          className={styles.critRemove}
          aria-label="Remove criterion"
          onClick={onRemove}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      <textarea
        className={styles.critInstruction}
        aria-label="Criterion instruction"
        rows={2}
        placeholder="Describe what the AI should look for…"
        value={criterion.instruction}
        onChange={(event) => onChange({ instruction: event.target.value })}
      />
      <div className={styles.critAnswer}>
        <span className={styles.critAnswerLabel}>Answer structure</span>
        <div className={styles.segmented}>
          {ANSWER_STRUCTURES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                criterion.answerStructure === option.value
                  ? `${styles.seg} ${styles.segOn}`
                  : styles.seg
              }
              onClick={() => onChange({ answerStructure: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
