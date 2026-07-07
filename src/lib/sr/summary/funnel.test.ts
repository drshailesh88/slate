import { describe, expect, it } from 'vitest';
import type { SafeProgress } from '@/lib/sr/authz/policy';
import { buildStageRail } from '@/lib/sr/stage-rail';
import { buildFunnelSummary, type FunnelStageView } from './funnel';

const REVIEW_ID = 'rev-1';

// A representative chokepoint payload: getSafeProgress emits completion counts
// ONLY. There is no decision distribution or conflict count anywhere in it — by
// construction it cannot leak a co-reviewer's vote.
function safeProgress(over: Partial<SafeProgress> = {}): SafeProgress {
  return {
    screening: { finishedReviewers: 2, totalReviewers: 3 },
    extraction: { finishedReviewers: 0, totalReviewers: 3 },
    rob: { finishedReviewers: 1, totalReviewers: 1 },
    ...over,
  };
}

function stageById(stages: FunnelStageView[], id: string): FunnelStageView {
  const stage = stages.find((s) => s.id === id);
  if (!stage) throw new Error(`stage ${id} missing from funnel`);
  return stage;
}

describe('buildFunnelSummary — counts come only from chokepoint-safe inputs', () => {
  it('takes the imported total from the non-blinded study count', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 412,
      safeProgress: safeProgress(),
    });
    expect(model.imported).toBe(412);
    expect(model.isEmpty).toBe(false);
    expect(stageById(model.stages, 'import').meta).toBe('412 imported');
  });

  it('flags first-run (empty) when nothing has been imported', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 0,
      safeProgress: safeProgress(),
    });
    expect(model.isEmpty).toBe(true);
    expect(stageById(model.stages, 'import').meta).toBe('No references yet');
  });

  it('maps each blinded surface to safe completion counts only', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 10,
      safeProgress: safeProgress(),
    });

    const screening = model.surfaces.find((s) => s.id === 'screening')!;
    expect(screening.finishedReviewers).toBe(2);
    expect(screening.totalReviewers).toBe(3);
    expect(screening.fraction).toBeCloseTo(2 / 3);
    expect(screening.caption).toBe('2 of 3 reviewers finished');

    // The surface view carries ONLY completion fields — no decision distribution,
    // no conflict count, no per-partner status. Guards against a future leak.
    expect(Object.keys(screening).sort()).toEqual(
      [
        'caption',
        'fraction',
        'finishedReviewers',
        'id',
        'label',
        'totalReviewers',
      ].sort(),
    );
  });

  it('pluralizes and handles the no-reviewers case in completion captions', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 5,
      safeProgress: safeProgress({
        rob: { finishedReviewers: 1, totalReviewers: 1 },
        extraction: { finishedReviewers: 0, totalReviewers: 0 },
      }),
    });
    expect(model.surfaces.find((s) => s.id === 'rob')!.caption).toBe(
      '1 of 1 reviewer finished',
    );
    const extraction = model.surfaces.find((s) => s.id === 'extraction')!;
    expect(extraction.caption).toBe('Awaiting reviewers');
    expect(extraction.fraction).toBe(0);
  });

  it('attaches completion meta to surface stages and nothing to blinded-only stages', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 10,
      safeProgress: safeProgress(),
    });
    expect(stageById(model.stages, 'screening').meta).toBe(
      '2 of 3 reviewers finished',
    );
    expect(stageById(model.stages, 'rob').meta).toBe(
      '1 of 1 reviewer finished',
    );
    // Full-text / conflicts / prisma have no SAFE count during independent — the
    // funnel shows no number for them rather than a blinded one.
    expect(stageById(model.stages, 'fulltext').meta).toBeNull();
    expect(stageById(model.stages, 'conflicts').meta).toBeNull();
    expect(stageById(model.stages, 'prisma').meta).toBeNull();
  });
});

describe('buildFunnelSummary — links stay consistent with the shell rail', () => {
  it('links built stages and leaves unbuilt stages inert', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 10,
      safeProgress: safeProgress(),
    });

    const importStage = stageById(model.stages, 'import');
    expect(importStage.built).toBe(true);
    expect(importStage.href).toBe(`/systematic-review/${REVIEW_ID}/import`);

    // Screening now has a route (T12) → built + linked.
    const screening = stageById(model.stages, 'screening');
    expect(screening.built).toBe(true);
    expect(screening.href).toBe(`/systematic-review/${REVIEW_ID}/screening`);

    // Conflicts now has a route (T13) → built + linked.
    const conflicts = stageById(model.stages, 'conflicts');
    expect(conflicts.built).toBe(true);
    expect(conflicts.href).toBe(`/systematic-review/${REVIEW_ID}/conflicts`);

    // Full-text et al. have no route yet → coming soon, no href.
    const fulltext = stageById(model.stages, 'fulltext');
    expect(fulltext.built).toBe(false);
    expect(fulltext.href).toBeNull();
  });

  it('renders exactly the shell rail funnel group, in order', () => {
    const model = buildFunnelSummary({
      reviewId: REVIEW_ID,
      studyCount: 10,
      safeProgress: safeProgress(),
    });
    const railFunnel = buildStageRail({
      reviewId: REVIEW_ID,
      activeStage: 'summary',
      studyCount: 10,
    }).find((g) => g.id === 'funnel')!;

    expect(model.stages.map((s) => s.id)).toEqual(
      railFunnel.items.map((i) => i.id),
    );
  });
});
