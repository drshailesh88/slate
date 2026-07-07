'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';
import {
  ROB_JUDGEMENT_LABEL,
  ROB_JUDGEMENT_TOKEN,
  type RobJudgement,
} from '@/lib/sr/rob/domains';
import type {
  RobReconcileDomainDTO,
  RobReconcileStudyDTO,
  RobStudyDTO,
} from '@/lib/sr/rob/types';
import { confirmRobJudgmentAction } from '@/app/(app)/systematic-review/[reviewId]/risk-of-bias/actions';
import styles from './rob-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// The reconcile reveal (post-firewall). Shows every reviewer's judgement + the AI
// reviewer's SUGGESTION per domain, at equal weight, the AI labeled. A reconciler
// (owner / arbitrator) records the reconciled judgement — the consensus starts
// empty, is never pre-selected, and the AI never writes it: a human confirms or
// overrides. "Use this" copies an input into the consensus DRAFT (still requires
// an explicit Confirm), so nothing resolves autonomously.
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

function JudgeDot({ judgement }: { judgement: RobJudgement }) {
  return (
    <span
      className={styles.judgeDot}
      style={{ background: ROB_JUDGEMENT_TOKEN[judgement] }}
      aria-hidden
    />
  );
}

function ReconcileDomainCard({
  reviewId,
  studyId,
  domain,
  canReconcile,
}: {
  reviewId: string;
  studyId: string;
  domain: RobReconcileDomainDTO;
  canReconcile: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [judgement, setJudgement] = useState<RobJudgement | null>(
    domain.consensus,
  );
  const [quote, setQuote] = useState(domain.consensusSupportQuote ?? '');
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(() => {
    if (!judgement || quote.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmRobJudgmentAction({
        reviewId,
        studyId,
        domainId: domain.domainId,
        judgement,
        supportQuote: quote,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not record the reconciled judgement.');
        return;
      }
      router.refresh();
    });
  }, [reviewId, studyId, domain.domainId, judgement, quote, router]);

  return (
    <div className={styles.domain}>
      <div className={styles.domainHead}>
        <span className={styles.domainName}>{domain.name}</span>
      </div>

      <div className={styles.entries}>
        {domain.entries.length === 0 ? (
          <p className={styles.readonlyNote}>
            No judgement recorded for this domain.
          </p>
        ) : (
          domain.entries.map((entry, index) => (
            <div
              key={`${entry.authorLabel}-${index}`}
              className={
                entry.isAi ? `${styles.entry} ${styles.entryAi}` : styles.entry
              }
            >
              <span className={styles.entryAuthor}>
                {entry.isAi ? (
                  <span className={styles.aiChip}>
                    <Sparkles size={11} aria-hidden /> AI
                  </span>
                ) : null}
                {entry.authorLabel}
              </span>
              <span
                className={styles.entryJudge}
                style={{ color: ROB_JUDGEMENT_TOKEN[entry.judgement] }}
              >
                <JudgeDot judgement={entry.judgement} />
                {ROB_JUDGEMENT_LABEL[entry.judgement]}
              </span>
              <span className={styles.entryQuote}>
                {entry.supportQuote ?? <em>no quote</em>}
                {canReconcile ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={styles.useButton}
                      disabled={pending}
                      onClick={() => {
                        setJudgement(entry.judgement);
                        setQuote(entry.supportQuote ?? '');
                      }}
                    >
                      Use this
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>

      {canReconcile ? (
        <div className={styles.consensusBox}>
          <div className={styles.consensusHead}>
            <span>Reconciled judgement</span>
            {domain.consensus ? (
              <span className={styles.savedTag}>
                <Check size={12} aria-hidden /> recorded
              </span>
            ) : null}
          </div>

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
                disabled={pending}
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
            htmlFor={`consensus-${studyId}-${domain.domainId}`}
          >
            Support for judgement
          </label>
          <textarea
            id={`consensus-${studyId}-${domain.domainId}`}
            className={styles.quote}
            value={quote}
            disabled={pending}
            placeholder="Cite the evidence for the reconciled judgement…"
            onChange={(event) => setQuote(event.target.value)}
          />

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

          <div className={styles.domainFoot}>
            <button
              type="button"
              className={styles.saveButton}
              disabled={pending || !judgement || quote.trim().length === 0}
              onClick={confirm}
            >
              <Check size={13} aria-hidden /> Confirm reconciled judgement
            </button>
          </div>
        </div>
      ) : domain.consensus ? (
        <div className={styles.consensusBox}>
          <div className={styles.consensusHead}>
            <span>Reconciled judgement</span>
          </div>
          <span
            className={styles.entryJudge}
            style={{ color: ROB_JUDGEMENT_TOKEN[domain.consensus] }}
          >
            <JudgeDot judgement={domain.consensus} />
            {ROB_JUDGEMENT_LABEL[domain.consensus]}
          </span>
          {domain.consensusSupportQuote ? (
            <p className={styles.entryQuote}>{domain.consensusSupportQuote}</p>
          ) : null}
        </div>
      ) : (
        <p className={styles.readonlyNote}>
          Awaiting the owner or arbitrator to record the reconciled judgement.
        </p>
      )}
    </div>
  );
}

export function RobReconcilePanel({
  reviewId,
  study,
  reconcile,
  canReconcile,
}: {
  reviewId: string;
  study: RobStudyDTO;
  reconcile: RobReconcileStudyDTO | undefined;
  canReconcile: boolean;
}) {
  const domains = reconcile?.domains ?? [];
  return (
    <div className={styles.main}>
      <div className={styles.reconcileBanner}>
        <Sparkles size={15} aria-hidden />
        <span>
          Independent appraisal is revealed. Every reviewer&apos;s judgement and
          the AI reviewer&apos;s labeled suggestion are shown together —
          {canReconcile
            ? ' record the reconciled judgement per domain. The AI never decides; you confirm.'
            : ' the owner or arbitrator records the reconciled judgement.'}
        </span>
      </div>

      {domains.map((domain) => (
        <ReconcileDomainCard
          key={domain.domainId}
          reviewId={reviewId}
          studyId={study.id}
          domain={domain}
          canReconcile={canReconcile}
        />
      ))}
    </div>
  );
}
