'use client';

import { Sparkles } from 'lucide-react';
import type { ReviewRole } from '@/lib/sr/authz/policy';
import type {
  FunnelStageView,
  FunnelSummaryModel,
} from '@/lib/sr/summary/funnel';
import type { SrStageId } from '@/lib/sr/stage-rail';
import { FunnelStageCard } from './funnel-stage-card';
import { StageButton, StageLink } from './stage-link';
import { TeamProgress } from './team-progress';
import styles from './review-summary.module.css';

// Screen 0 — the funnel home. Ported from the ScholarSync precursor's
// review-summary.tsx, but every number it renders is chokepoint-safe: the
// imported total (non-blinded) and completion counts only. It NEVER renders a
// decision distribution, conflict count, or per-partner status — the model it is
// handed cannot carry them (see @/lib/sr/summary/funnel + team-progress).

interface ReviewSummaryProps {
  model: FunnelSummaryModel;
  reviewTitle: string;
  reviewType: string;
  role: ReviewRole;
}

function AiChip() {
  return (
    <span className={styles.aichip}>
      <Sparkles size={10} aria-hidden /> AI
    </span>
  );
}

// The single quiet next-action per funnel stage. Rendered only for built stages;
// StageLink itself stays inert for anything not yet routed.
const STAGE_ACTION: Partial<Record<SrStageId, string>> = {
  import: 'Import more →',
  screening: 'Continue screening →',
  conflicts: 'Resolve conflicts →',
  fulltext: 'Assess full text →',
  rob: 'Appraise risk of bias →',
  extraction: 'Extract data →',
  prisma: 'View PRISMA →',
  report: 'Open report →',
  export: 'Export →',
};

function StageCard({
  stage,
  reviewId,
  defaultOpen,
  children,
}: {
  stage: FunnelStageView;
  reviewId: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const action = STAGE_ACTION[stage.id];
  return (
    <FunnelStageCard
      name={stage.label}
      n={stage.n}
      meta={stage.meta}
      built={stage.built}
      defaultOpen={defaultOpen}
      links={
        action ? (
          <StageLink reviewId={reviewId} stage={stage.id}>
            {action}
          </StageLink>
        ) : null
      }
    >
      {children}
    </FunnelStageCard>
  );
}

function FirstRun({ reviewId }: { reviewId: string }) {
  return (
    <div className={styles.stateblock}>
      <AiChip />
      <h3>No references yet</h3>
      <p>
        Import your search results (RIS / EndNote / PubMed / CSV) to start
        screening. Slate deduplicates on import and keeps a reversible ledger
        for PRISMA. Two reviewers then screen <b>independently and blinded</b> —
        the human vote is the system of record.
      </p>
      <div className={styles.actions}>
        <StageButton reviewId={reviewId} stage="import" primary>
          Import references
        </StageButton>
      </div>
    </div>
  );
}

export function ReviewSummary({
  model,
  reviewTitle,
  reviewType,
  role,
}: ReviewSummaryProps) {
  const { reviewId, imported, isEmpty, stages, surfaces } = model;

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>
        {reviewTitle} · {reviewType}
      </div>
      <h1 className={styles.title}>Review Summary</h1>
      <p className={styles.lead}>
        The review home is a funnel with live counts and a per-stage next
        action. You are {article(role)} <b>{role}</b> on this review. The human
        vote is always the <b>system of record</b>.
      </p>

      <div className={styles.aistrip}>
        <AiChip />
        <span>
          AI gives every reviewer a running head-start on their own queue — you
          confirm or override. It never casts the deciding vote.
        </span>
        <span className={styles.sysrec}>Human vote = system of record</span>
      </div>

      {isEmpty ? (
        <FirstRun reviewId={reviewId} />
      ) : (
        <>
          <div className={styles.funnelviz}>
            <div className={`${styles.vizcell} ${styles.lead}`}>
              <div className={styles.vizNum}>{imported.toLocaleString()}</div>
              <div className={styles.vizLabel}>References imported</div>
            </div>
            <div className={styles.vizcell}>
              <p className={styles.lead} style={{ margin: 0 }}>
                Screening → full-text → extraction narrow the funnel from here.
                Downstream counts stay <b>blinded</b> until the review reaches
                reconcile — only completion progress is shown while reviewers
                work independently.
              </p>
            </div>
          </div>

          <div className={styles.seclabel}>The funnel</div>
          <div className={styles.funnel}>
            {stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                reviewId={reviewId}
                defaultOpen={stage.id === 'screening'}
              >
                {stage.id === 'screening' ? (
                  <TeamProgress surfaces={surfaces} />
                ) : null}
              </StageCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? 'an' : 'a';
}
