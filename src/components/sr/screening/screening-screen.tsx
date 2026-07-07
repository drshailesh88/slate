'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, Flag } from 'lucide-react';
import {
  buildOwnQueue,
  decisionsByStudy,
  nextPendingIndex,
} from '@/lib/sr/screening/queue';
import type {
  ScreeningDecisionKind,
  ScreeningViewDTO,
} from '@/lib/sr/screening/types';
import {
  castDecisionAction,
  finishScreeningAction,
  unblindScreeningAction,
} from '@/app/(app)/systematic-review/[reviewId]/screening/actions';
import { DecisionRail } from './decision-rail';
import { ReferenceCard } from './reference-card';
import styles from './screening-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Blind title/abstract screening (T12). Three zones: the funnel rail (the app
// shell), the current study (center), and YOUR decision only (right). The view
// is server-resolved and own-only — the client never receives a co-reviewer's
// vote or the AI's verdict/score during independent, so it cannot render one.
// ─────────────────────────────────────────────────────────────────────────────

const KEY_TO_DECISION: Record<string, ScreeningDecisionKind> = {
  i: 'include',
  m: 'maybe',
  e: 'exclude',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function ScreeningScreen({ view }: { view: ScreeningViewDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(0);
  const [useAiOrder, setUseAiOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnblind, setConfirmUnblind] = useState(false);

  const aiOrderAvailable = view.aiRanking != null && view.aiRanking.length > 0;

  const queue = useMemo(
    () =>
      buildOwnQueue(view.studies, view.decisions, {
        aiRanking: view.aiRanking,
        useAiOrder,
      }),
    [view.studies, view.decisions, view.aiRanking, useAiOrder],
  );
  const decisionMap = useMemo(
    () => decisionsByStudy(view.decisions),
    [view.decisions],
  );
  const studyMap = useMemo(
    () => new Map(view.studies.map((s) => [s.id, s])),
    [view.studies],
  );

  const total = queue.order.length;
  const safeCursor = total === 0 ? 0 : Math.min(cursor, total - 1);
  const currentId = queue.order[safeCursor];
  const current = currentId ? studyMap.get(currentId) : undefined;
  const ownDecision = currentId ? decisionMap.get(currentId) : undefined;

  const advance = useCallback(() => {
    const decided = new Set(view.decisions.map((d) => d.studyId));
    if (currentId) decided.add(currentId);
    const next = nextPendingIndex(queue.order, decided, safeCursor);
    if (next >= 0) setCursor(next);
  }, [view.decisions, currentId, queue.order, safeCursor]);

  const cast = useCallback(
    (
      decision: ScreeningDecisionKind,
      excludeReasonCode: string | null = null,
      excludeReasonDetail: string | null = null,
    ) => {
      if (!currentId || !view.canScreen || view.finished) return;
      setError(null);
      startTransition(async () => {
        const result = await castDecisionAction({
          reviewId: view.reviewId,
          studyId: currentId,
          decision,
          excludeReasonCode,
          excludeReasonDetail,
        });
        if (!result.ok) {
          setError(result.error ?? 'Could not save your decision.');
          return;
        }
        router.refresh();
        // Include / Maybe move on; Exclude stays so a reason can be attached.
        if (decision !== 'exclude') advance();
      });
    },
    [currentId, view.canScreen, view.finished, view.reviewId, router, advance],
  );

  const setExcludeReason = useCallback(
    (code: string | null, detail: string | null) => {
      if (!currentId) return;
      setError(null);
      startTransition(async () => {
        const result = await castDecisionAction({
          reviewId: view.reviewId,
          studyId: currentId,
          decision: 'exclude',
          excludeReasonCode: code,
          excludeReasonDetail: detail,
        });
        if (!result.ok) {
          setError(result.error ?? 'Could not save the exclusion reason.');
          return;
        }
        router.refresh();
      });
    },
    [currentId, view.reviewId, router],
  );

  const finish = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await finishScreeningAction(view.reviewId);
      if (!result.ok) {
        setError(result.error ?? 'Could not finish screening.');
        return;
      }
      router.refresh();
    });
  }, [view.reviewId, router]);

  const unblind = useCallback(() => {
    setError(null);
    setConfirmUnblind(false);
    startTransition(async () => {
      const result = await unblindScreeningAction(view.reviewId);
      if (!result.ok) {
        setError(result.error ?? 'Could not reveal decisions.');
        return;
      }
      router.refresh();
    });
  }, [view.reviewId, router]);

  useEffect(() => {
    if (view.phase !== 'independent' || !view.canScreen || view.finished) return;
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const decision = KEY_TO_DECISION[event.key.toLowerCase()];
      if (decision) {
        event.preventDefault();
        cast(decision);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCursor((index) => Math.max(0, index - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCursor((index) => Math.min(total - 1, index + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view.phase, view.canScreen, view.finished, cast, total]);

  const header = (
    <header className={styles.header}>
      <div className={styles.eyebrow}>
        {view.reviewType} · {view.reviewTitle}
      </div>
      <h1 className={styles.title}>{view.stageLabel} screening</h1>
    </header>
  );

  if (view.phase === 'reconcile') {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.handoff}>
          <Eye size={18} aria-hidden />
          <h2>Screening revealed for reconciliation</h2>
          <p>
            Independent screening is closed. Every reviewer&apos;s calls — and the
            AI reviewer&apos;s — are now visible together for reconciliation. This
            can&apos;t be re-hidden.
          </p>
          <Link
            className={styles.handoffLink}
            href={`/systematic-review/${view.reviewId}/conflicts`}
          >
            Go to conflicts
          </Link>
        </div>
      </div>
    );
  }

  if (view.studies.length === 0) {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.handoff}>
          <h2>Nothing to screen yet</h2>
          <p>
            Import references into this review, then return here to screen titles
            and abstracts.
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

  return (
    <div className={styles.screen}>
      {header}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.actions}>
        <span className={styles.lead}>
          Screen each study against the protocol. Keyboard:{' '}
          <span className={styles.kbd}>I</span>
          <span className={styles.kbd}>M</span>
          <span className={styles.kbd}>E</span> to decide,{' '}
          <span className={styles.kbd}>←</span>
          <span className={styles.kbd}>→</span> to move.
        </span>
        <div className={styles.actionsSpacer} />
        {view.canScreen && !view.finished ? (
          <button
            type="button"
            className={styles.finishButton}
            onClick={finish}
            disabled={pending || queue.decidedCount === 0}
          >
            <Flag size={13} aria-hidden /> Finish screening — reveal for
            reconciliation
          </button>
        ) : null}
        {view.canUnblind ? (
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

      {view.finished ? (
        <div className={styles.finishedBanner} role="status">
          You&apos;ve finished screening — your decisions are locked while you wait
          for the other reviewers. {view.progress.finishedReviewers} of{' '}
          {view.progress.totalReviewers} reviewers finished.
        </div>
      ) : null}

      {confirmUnblind ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Confirm reveal">
          <p>
            Reveal all decisions and start reconciliation?{' '}
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
        <div className={styles.main}>
          <div className={styles.queueBar}>
            <span className={styles.position}>
              Study {safeCursor + 1} of {total} · {queue.decidedCount} decided
            </span>
            <div className={styles.nav}>
              <button
                type="button"
                aria-label="Previous study"
                disabled={safeCursor === 0 || pending}
                onClick={() => setCursor((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next study"
                disabled={safeCursor >= total - 1 || pending}
                onClick={() =>
                  setCursor((index) => Math.min(total - 1, index + 1))
                }
              >
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>
          </div>

          {current ? (
            <ReferenceCard study={current} terms={view.highlightTerms} />
          ) : null}
        </div>

        <DecisionRail
          canScreen={view.canScreen}
          finished={view.finished}
          ownDecision={ownDecision}
          onVote={(decision) => cast(decision)}
          onExcludeReasonChange={setExcludeReason}
          criteria={view.criteria}
          progress={view.progress}
          useAiOrder={useAiOrder}
          aiOrderAvailable={aiOrderAvailable}
          onToggleAiOrder={setUseAiOrder}
          pending={pending}
        />
      </div>
    </div>
  );
}
