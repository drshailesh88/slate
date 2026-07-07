'use client';

import { useState, useTransition } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Lock,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import {
  AI_CO_REVIEWER_NOTE,
  BLIND_MODE_LABEL,
  BLIND_MODE_NOTE,
  INVITABLE_ROLES,
  REVIEW_MODES,
  REVIEW_TYPES,
  type ReviewMode,
  type ReviewRole,
} from '@/lib/sr/review-modes';
import { createReviewAction } from './actions';
import styles from './create-review.module.css';

interface InviteRow {
  email: string;
  role: ReviewRole;
}

const STEPS = ['Info', 'Import', 'Team'] as const;

export function CreateReviewWizard() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [reviewType, setReviewType] = useState('');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('two_reviewer');
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    if (step === 0) {
      if (title.trim().length === 0) {
        setStepError('Enter a title for your review.');
        return;
      }
      if (!REVIEW_TYPES.includes(reviewType as (typeof REVIEW_TYPES)[number])) {
        setStepError('Choose a review type.');
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleCreate() {
    setActionError(null);
    startTransition(async () => {
      const result = await createReviewAction({
        title,
        reviewType,
        reviewMode,
        invites,
      });
      if (result?.error) setActionError(result.error);
    });
  }

  return (
    <div className={styles.wizard}>
      <div className={styles.head}>
        <div className={styles.eyebrow}>Systematic review</div>
        <h1 className={styles.title}>New review</h1>
      </div>

      <ol className={styles.stepper} aria-label="Progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={styles.stepChip}
            aria-current={index === step ? 'step' : undefined}
            data-state={
              index < step ? 'done' : index === step ? 'active' : 'todo'
            }
          >
            <span className={styles.stepDot}>
              {index < step ? <Check size={12} strokeWidth={2.5} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className={styles.panel} key={step}>
        {step === 0 && (
          <StepInfo
            title={title}
            setTitle={setTitle}
            reviewType={reviewType}
            setReviewType={setReviewType}
            reviewMode={reviewMode}
            setReviewMode={setReviewMode}
          />
        )}
        {step === 1 && <StepImport />}
        {step === 2 && <StepTeam invites={invites} setInvites={setInvites} />}
      </div>

      {(stepError || actionError) && (
        <p className={styles.error} role="alert" aria-live="polite">
          {stepError ?? actionError}
        </p>
      )}

      <div className={styles.footer}>
        {step > 0 ? (
          <button type="button" className={styles.ghost} onClick={goBack}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </button>
        ) : (
          <span />
        )}

        {step < STEPS.length - 1 ? (
          <button type="button" className={styles.primary} onClick={goNext}>
            {step === 1 ? 'Skip — import later' : 'Next'}
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={handleCreate}
            disabled={pending}
          >
            {pending ? 'Creating…' : 'Create review'}
          </button>
        )}
      </div>
    </div>
  );
}

function StepInfo({
  title,
  setTitle,
  reviewType,
  setReviewType,
  reviewMode,
  setReviewMode,
}: {
  title: string;
  setTitle: (v: string) => void;
  reviewType: string;
  setReviewType: (v: string) => void;
  reviewMode: ReviewMode;
  setReviewMode: (v: ReviewMode) => void;
}) {
  return (
    <div className={styles.stack}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="review-title">
          Review title
        </label>
        <input
          id="review-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. SGLT2 inhibitors for heart failure with preserved EF"
          maxLength={200}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="review-type">
          Review type
        </label>
        <select
          id="review-type"
          className={styles.select}
          value={reviewType}
          onChange={(e) => setReviewType(e.target.value)}
        >
          <option value="" disabled>
            Choose a type…
          </option>
          {REVIEW_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.label}>How is the review staffed?</legend>
        <div className={styles.modeGrid}>
          {REVIEW_MODES.map((mode) => (
            <label
              key={mode.value}
              className={styles.modeCard}
              data-selected={reviewMode === mode.value}
            >
              <input
                type="radio"
                name="review-mode"
                className={styles.radio}
                value={mode.value}
                checked={reviewMode === mode.value}
                onChange={() => setReviewMode(mode.value)}
              />
              <span className={styles.modeBody}>
                <span className={styles.modeLabel}>{mode.label}</span>
                <span className={styles.modeDesc}>{mode.description}</span>
              </span>
            </label>
          ))}
        </div>
        {reviewMode === 'ai_co_reviewer' && (
          <p className={styles.aiNote}>
            <Info size={14} strokeWidth={1.75} aria-hidden />
            {AI_CO_REVIEWER_NOTE}
          </p>
        )}
      </fieldset>

      <div className={styles.locked} aria-label={`${BLIND_MODE_LABEL} is on`}>
        <Lock size={14} strokeWidth={1.75} aria-hidden />
        <span className={styles.lockedText}>
          <strong>{BLIND_MODE_LABEL} — On</strong>
          <span className={styles.lockedNote}>{BLIND_MODE_NOTE}</span>
        </span>
      </div>
    </div>
  );
}

function StepImport() {
  return (
    <div className={styles.stack}>
      <div className={styles.infoBlock}>
        <span className={styles.infoIcon}>
          <Upload size={18} strokeWidth={1.75} />
        </span>
        <h2 className={styles.infoTitle}>Import your references</h2>
        <p className={styles.infoBody}>
          You arrive with your search results — RIS, EndNote, CSV, BibTeX, or
          PubMed exports. Importing happens on the review&rsquo;s Import screen,
          so you can skip ahead now and bring references in once the review
          exists.
        </p>
      </div>
    </div>
  );
}

function StepTeam({
  invites,
  setInvites,
}: {
  invites: InviteRow[];
  setInvites: (rows: InviteRow[]) => void;
}) {
  function addRow() {
    setInvites([...invites, { email: '', role: 'reviewer' }]);
  }
  function updateRow(index: number, patch: Partial<InviteRow>) {
    setInvites(
      invites.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  function removeRow(index: number) {
    setInvites(invites.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.stack}>
      <p className={styles.teamLead}>
        You&rsquo;ll be the <strong>Owner</strong>. Invite teammates now, or add
        them anytime from the review&rsquo;s Members screen — this step is
        optional.
      </p>

      {invites.length > 0 && (
        <ul className={styles.inviteList}>
          {invites.map((row, index) => {
            const role = INVITABLE_ROLES.find((r) => r.value === row.role);
            return (
              <li key={index} className={styles.inviteRow}>
                <div className={styles.inviteInputs}>
                  <input
                    className={styles.input}
                    type="email"
                    value={row.email}
                    onChange={(e) =>
                      updateRow(index, { email: e.target.value })
                    }
                    placeholder="name@institution.edu"
                    aria-label={`Teammate ${index + 1} email`}
                  />
                  <select
                    className={styles.select}
                    value={row.role}
                    onChange={(e) =>
                      updateRow(index, { role: e.target.value as ReviewRole })
                    }
                    aria-label={`Teammate ${index + 1} role`}
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => removeRow(index)}
                    aria-label={`Remove teammate ${index + 1}`}
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                </div>
                {role && (
                  <span className={styles.roleHint}>{role.description}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className={styles.addRow} onClick={addRow}>
        <Plus size={15} strokeWidth={2} />
        Add teammate
      </button>
    </div>
  );
}
