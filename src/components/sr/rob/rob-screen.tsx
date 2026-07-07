'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Flag, Lock, Sparkles } from 'lucide-react';
import {
  ROB_JUDGEMENT_LABEL,
  ROB_JUDGEMENT_TOKEN,
  type RobJudgement,
} from '@/lib/sr/rob/domains';
import type {
  OwnDomainJudgementDTO,
  RobDomainMetaDTO,
  RobStudyDTO,
  RobViewDTO,
} from '@/lib/sr/rob/types';
import {
  castRobJudgmentAction,
  finishRobAction,
  runAiRobSuggestionsAction,
  unblindRobAction,
} from '@/app/(app)/systematic-review/[reviewId]/risk-of-bias/actions';
import { RobReconcilePanel } from './rob-reconcile';
import styles from './rob-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Risk-of-Bias appraisal (T16). Per-study, per-domain judgement (Low / Some
// concerns / High) with a REQUIRED support-for-judgement quote, dual + blinded.
// The view is server-resolved and own-only during independent — the client never
// receives a co-reviewer's judgement or the AI's suggestion, so it cannot render
// one. At reconcile the reveal panel shows all inputs, the AI labeled + never
// autonomous.
// ─────────────────────────────────────────────────────────────────────────────

const JUDGEMENTS: ReadonlyArray<{
  value: RobJudgement;
  label: string;
  cls: string;
}> = [
  { value: 'low', label: 'Low', cls: styles.judgeLow },
  { value: 'some', label: 'Some concerns', cls: styles.judgeSome },
  { value: 'high', label: 'High', cls: styles.judgeHigh },
];

function OverallPill({ overall }: { overall: RobJudgement }) {
  return (
    <span className={styles.pill}>
      <span
        className={styles.pillDot}
        style={{ background: ROB_JUDGEMENT_TOKEN[overall] }}
        aria-hidden
      />
      Overall: {ROB_JUDGEMENT_LABEL[overall]}
    </span>
  );
}

function DomainJudge({
  reviewId,
  study,
  domain,
  own,
  canAppraise,
}: {
  reviewId: string;
  study: RobStudyDTO;
  domain: RobDomainMetaDTO;
  own: OwnDomainJudgementDTO | undefined;
  canAppraise: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [judgement, setJudgement] = useState<RobJudgement | null>(
    own?.judgement ?? null,
  );
  const [quote, setQuote] = useState(own?.supportQuote ?? '');
  const [error, setError] = useState<string | null>(null);

  const locked = own?.locked ?? false;
  const disabled = !canAppraise || locked || pending;

  const save = useCallback(() => {
    if (!judgement || quote.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await castRobJudgmentAction({
        reviewId,
        studyId: study.id,
        domainId: domain.id,
        judgement,
        supportQuote: quote,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not save this judgement.');
        return;
      }
      router.refresh();
    });
  }, [reviewId, study.id, domain.id, judgement, quote, router]);

  const dirty =
    judgement !== (own?.judgement ?? null) ||
    quote !== (own?.supportQuote ?? '');

  return (
    <div className={styles.domain}>
      <div className={styles.domainHead}>
        <span className={styles.domainName}>{domain.name}</span>
      </div>
      <ul className={styles.signalling}>
        {domain.signalling.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>

      <div className={styles.judges}>
        {JUDGEMENTS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              judgement === option.value
                ? `${styles.judge} ${option.cls} ${styles.judgeSelected}`
                : `${styles.judge} ${option.cls}`
            }
            disabled={disabled}
            onClick={() => setJudgement(option.value)}
          >
            <span
              className={styles.judgeDot}
              style={{ background: ROB_JUDGEMENT_TOKEN[option.value] }}
              aria-hidden
            />
            {option.label}
          </button>
        ))}
      </div>

      <label
        className={styles.quoteLabel}
        htmlFor={`quote-${study.id}-${domain.id}`}
      >
        Support for judgement
      </label>
      <textarea
        id={`quote-${study.id}-${domain.id}`}
        className={styles.quote}
        value={quote}
        disabled={disabled}
        placeholder="Quote the study text that supports this judgement…"
        onChange={(event) => setQuote(event.target.value)}
      />

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.domainFoot}>
        {locked ? (
          <span className={styles.lockedTag}>
            <Lock size={12} aria-hidden /> Locked
          </span>
        ) : (
          <button
            type="button"
            className={styles.saveButton}
            disabled={disabled || !judgement || quote.trim().length === 0}
            onClick={save}
          >
            <Check size={13} aria-hidden /> Save judgement
          </button>
        )}
        {own && !dirty && !locked ? (
          <span className={styles.savedTag}>
            <Check size={12} aria-hidden /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StudyListRail({
  studies,
  activeId,
  onSelect,
  progress,
}: {
  studies: RobStudyDTO[];
  activeId: string;
  onSelect: (id: string) => void;
  progress: RobViewDTO['progress'];
}) {
  return (
    <aside className={styles.rail}>
      <span className={styles.railSubhead}>Studies to appraise</span>
      <div className={styles.studyList}>
        {studies.map((study) => (
          <button
            key={study.id}
            type="button"
            className={
              study.id === activeId
                ? `${styles.studyRow} ${styles.studyRowActive}`
                : styles.studyRow
            }
            onClick={() => onSelect(study.id)}
          >
            <span
              className={styles.pillDot}
              style={{ background: ROB_JUDGEMENT_TOKEN[study.overall] }}
              aria-hidden
            />
            <span className={styles.studyRowMain}>
              <span className={styles.studyRowTitle}>{study.title}</span>
              <span className={styles.studyRowSub}>
                {study.refId} · {ROB_JUDGEMENT_LABEL[study.overall]}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.progress}>
        <span className={styles.progressCount}>
          {progress.finishedReviewers}/{progress.totalReviewers}
        </span>
        reviewers finished
      </div>
      <p className={styles.railNote}>
        Each study is appraised by two reviewers independently, then reconciled
        — like extraction.
      </p>
    </aside>
  );
}

export function RobScreen({ view }: { view: RobViewDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmUnblind, setConfirmUnblind] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const ownByStudyDomain = useMemo(() => {
    const map = new Map<string, OwnDomainJudgementDTO>();
    for (const j of view.judgements) map.set(`${j.studyId}::${j.domainId}`, j);
    return map;
  }, [view.judgements]);

  const reconcileByStudy = useMemo(
    () => new Map(view.reconciliation.map((r) => [r.studyId, r])),
    [view.reconciliation],
  );

  const activeStudy =
    view.studies.find((s) => s.id === activeId) ?? view.studies[0];

  const finish = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await finishRobAction(view.reviewId);
      if (!result.ok) {
        setError(result.error ?? 'Could not finish appraisal.');
        return;
      }
      router.refresh();
    });
  }, [view.reviewId, router]);

  const unblind = useCallback(() => {
    setError(null);
    setConfirmUnblind(false);
    startTransition(async () => {
      const result = await unblindRobAction(view.reviewId);
      if (!result.ok) {
        setError(result.error ?? 'Could not reveal judgements.');
        return;
      }
      router.refresh();
    });
  }, [view.reviewId, router]);

  const runAi = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await runAiRobSuggestionsAction(view.reviewId);
      if (!result.ok) {
        setError(result.error ?? 'Could not run AI suggestions.');
        return;
      }
      router.refresh();
    });
  }, [view.reviewId, router]);

  const header = (
    <header className={styles.header}>
      <div className={styles.eyebrow}>
        Stage 5 · The funnel · {view.reviewTitle}
      </div>
      <h1 className={styles.title}>Risk of bias</h1>
      <p className={styles.lead}>
        A structured, domain-by-domain appraisal with a per-domain judgement and
        a support-for-judgement quote, dual-assessed and reconciled. The AI
        suggests a judgement from the methods text; a human confirms.
      </p>
    </header>
  );

  if (view.studies.length === 0) {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.handoff}>
          <h2>Nothing to appraise yet</h2>
          <p>
            Included studies appear here for RoB 2 / ROBINS-I appraisal once
            references are imported and screened.
          </p>
          <Link
            className={styles.handoffLink}
            href={`/systematic-review/${view.reviewId}/import`}
          >
            Go to import
          </Link>
        </div>
      </div>
    );
  }

  const study = activeStudy;

  return (
    <div className={styles.screen}>
      {header}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.actions}>
        <div className={styles.actionsSpacer} />
        {view.phase === 'independent' && view.canAppraise && !view.finished ? (
          <button
            type="button"
            className={styles.finishButton}
            onClick={finish}
            disabled={pending || view.judgements.length === 0}
          >
            <Flag size={13} aria-hidden /> Finish appraisal — reveal for
            reconciliation
          </button>
        ) : null}
        {view.phase === 'independent' && view.canUnblind ? (
          <button
            type="button"
            className={styles.unblindButton}
            onClick={runAi}
            disabled={pending}
            title="AI suggestions are written blinded and revealed only at reconciliation"
          >
            <Sparkles size={13} aria-hidden /> Run AI suggestions
          </button>
        ) : null}
        {view.phase === 'independent' && view.canUnblind ? (
          <button
            type="button"
            className={styles.unblindButton}
            onClick={() => setConfirmUnblind(true)}
            disabled={pending}
          >
            <Eye size={13} aria-hidden /> Reveal for reconciliation
          </button>
        ) : null}
      </div>

      {view.phase === 'independent' && view.finished ? (
        <div className={styles.finishedBanner} role="status">
          You&apos;ve finished appraising — your judgements are locked while you
          wait for the other reviewers. {view.progress.finishedReviewers} of{' '}
          {view.progress.totalReviewers} reviewers finished.
        </div>
      ) : null}

      {view.phase === 'independent' ? (
        <div className={styles.blindBanner}>
          <span className={styles.blindDot} aria-hidden />
          <span>
            Independent appraisal — your partner&apos;s judgements and any AI
            suggestion stay hidden until you both finish. This protects the
            review.
          </span>
        </div>
      ) : null}

      {confirmUnblind ? (
        <div
          className={styles.confirm}
          role="alertdialog"
          aria-label="Confirm reveal"
        >
          <p>
            Reveal all judgements and start reconciliation?{' '}
            <b>This can&apos;t be re-hidden.</b>
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmCancel}
              onClick={() => setConfirmUnblind(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmProceed}
              onClick={unblind}
              disabled={pending}
            >
              Reveal &amp; reconcile
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.layout}>
        {view.phase === 'independent' ? (
          <div className={styles.main}>
            <div className={styles.studyHead}>
              <span className={styles.studyRefId}>{study.refId}</span>
              <OverallPill overall={study.overall} />
            </div>
            <h2 className={styles.studyTitle}>{study.title}</h2>
            <div className={styles.studyMeta}>
              {[study.authors, study.journal, study.year]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className={styles.instrumentRow}>
              <span className={styles.instrumentLabel}>
                {study.instrumentLabel}
              </span>
            </div>

            {study.domains.map((domain) => (
              <DomainJudge
                key={domain.id}
                reviewId={view.reviewId}
                study={study}
                domain={domain}
                own={ownByStudyDomain.get(`${study.id}::${domain.id}`)}
                canAppraise={view.canAppraise}
              />
            ))}
          </div>
        ) : (
          <RobReconcilePanel
            reviewId={view.reviewId}
            study={study}
            reconcile={reconcileByStudy.get(study.id)}
            canReconcile={view.canReconcile}
          />
        )}

        <StudyListRail
          studies={view.studies}
          activeId={study.id}
          onSelect={setActiveId}
          progress={view.progress}
        />
      </div>
    </div>
  );
}
