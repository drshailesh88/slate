import {
  activeStageFromPath,
  buildStageRail,
  BUILT_STAGES,
  isStageBuilt,
  stageHref,
  type SrStageId,
  type StageRailItem,
} from './stage-rail';

const REVIEW_ID = 'rev-123';

function flatItems(studyCount?: number): StageRailItem[] {
  return buildStageRail({
    reviewId: REVIEW_ID,
    activeStage: 'summary',
    studyCount,
  }).flatMap((group) => group.items);
}

function itemFor(id: SrStageId, studyCount?: number): StageRailItem {
  const item = flatItems(studyCount).find((i) => i.id === id);
  if (!item) throw new Error(`no rail item for ${id}`);
  return item;
}

describe('BUILT_STAGES', () => {
  it('is the M2 setup spine plus the built M3 screening/conflicts and M4 RoB/extraction screens', () => {
    expect([...BUILT_STAGES]).toEqual([
      'summary',
      'members',
      'protocol',
      'import',
      'screening',
      'conflicts',
      'rob',
      'extraction',
    ]);
  });

  it('isStageBuilt agrees with the list', () => {
    expect(isStageBuilt('summary')).toBe(true);
    expect(isStageBuilt('import')).toBe(true);
    expect(isStageBuilt('screening')).toBe(true);
    expect(isStageBuilt('conflicts')).toBe(true);
    expect(isStageBuilt('rob')).toBe(true);
    expect(isStageBuilt('export')).toBe(false);
  });
});

describe('buildStageRail', () => {
  it('produces the Review and Funnel groups', () => {
    const groups = buildStageRail({
      reviewId: REVIEW_ID,
      activeStage: 'summary',
    });
    expect(groups.map((g) => g.id)).toEqual(['review', 'funnel']);
    expect(groups[0].items.map((i) => i.id)).toEqual([
      'summary',
      'members',
      'protocol',
    ]);
    expect(groups[1].items.map((i) => i.id)).toEqual([
      'import',
      'screening',
      'conflicts',
      'fulltext',
      'rob',
      'extraction',
      'prisma',
      'report',
      'export',
    ]);
  });

  it('links every built stage and locks every unbuilt stage', () => {
    for (const item of flatItems()) {
      if (BUILT_STAGES.includes(item.id)) {
        expect(item.comingSoon).toBe(false);
        expect(item.href).toBe(stageHref(REVIEW_ID, item.id));
      } else {
        expect(item.comingSoon).toBe(true);
        expect(item.href).toBeUndefined();
      }
    }
  });

  it('marks exactly the active stage active', () => {
    const groups = buildStageRail({
      reviewId: REVIEW_ID,
      activeStage: 'import',
    });
    const active = groups.flatMap((g) => g.items).filter((i) => i.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('import');
  });

  it('shows the study count on Import only when there are studies', () => {
    expect(itemFor('import', 12).count).toBe('12');
    expect(itemFor('import', 0).count).toBeUndefined();
    expect(itemFor('import').count).toBeUndefined();
    // The count never appears on any other stage.
    expect(itemFor('screening', 12).count).toBeUndefined();
    expect(itemFor('summary', 12).count).toBeUndefined();
  });
});

describe('stageHref', () => {
  it('maps summary to the review index and stages to child segments', () => {
    const base = `/systematic-review/${REVIEW_ID}`;
    expect(stageHref(REVIEW_ID, 'summary')).toBe(base);
    expect(stageHref(REVIEW_ID, 'import')).toBe(`${base}/import`);
    expect(stageHref(REVIEW_ID, 'members')).toBe(`${base}/members`);
    expect(stageHref(REVIEW_ID, 'protocol')).toBe(`${base}/protocol`);
    expect(stageHref(REVIEW_ID, 'fulltext')).toBe(`${base}/full-text`);
    expect(stageHref(REVIEW_ID, 'rob')).toBe(`${base}/risk-of-bias`);
  });
});

describe('activeStageFromPath', () => {
  const base = `/systematic-review/${REVIEW_ID}`;

  it('resolves the review index to summary', () => {
    expect(activeStageFromPath(base, REVIEW_ID)).toBe('summary');
  });

  it('resolves child segments to their stage', () => {
    expect(activeStageFromPath(`${base}/import`, REVIEW_ID)).toBe('import');
    expect(activeStageFromPath(`${base}/full-text`, REVIEW_ID)).toBe(
      'fulltext',
    );
    expect(activeStageFromPath(`${base}/risk-of-bias`, REVIEW_ID)).toBe('rob');
    expect(activeStageFromPath(`${base}/protocol`, REVIEW_ID)).toBe('protocol');
  });

  it('falls back to summary for an unknown segment', () => {
    expect(activeStageFromPath(`${base}/mystery`, REVIEW_ID)).toBe('summary');
  });
});
