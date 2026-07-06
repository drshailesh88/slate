import { getDb } from '@/lib/db/client';
import { organizations, users } from '@/lib/db/schema';
import { reviewMembers, reviews, studies } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// Dev/test seed — inserts a demo review as REAL DB rows so the SR shell and the
// M2 screens have something to render before the create wizard exists. NOT a
// runtime fixture: these are ordinary rows the chokepoint/authz read normally.
//
// Guarded to non-production. Idempotent: every row uses a fixed id and inserts
// with onConflictDoNothing / upsert, so re-running is a no-op. The owner is
// keyed on the dev-bypass mock session (workos_user_id "user_dev_mock", "Dr.
// Singh") so requireMember resolves the mock caller as owner in dev.
//
// Seeds only VISIBLE tables (org, users, review, members, studies). It never
// writes the blinded base tables — those stay empty, which is the correct
// "independent, nothing finished yet" starting state.
// ─────────────────────────────────────────────────────────────────────────────

export const DEV_SEED = {
  orgId: 'org_dev_demo',
  reviewId: '00000000-0000-4000-8000-000000000001',
  ownerWorkosId: 'user_dev_mock',
  reviewerWorkosId: 'user_dev_reviewer',
} as const;

const STUDY_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
] as const;

type Db = ReturnType<typeof getDb>;

export interface DevSeedResult {
  reviewId: string;
  ownerId: string;
  reviewerId: string;
  studyCount: number;
}

export async function seedDevReview(db: Db = getDb()): Promise<DevSeedResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seedDevReview is a dev/test helper and must never run in production. ' +
        'It inserts demo rows keyed on the dev-bypass mock session.',
    );
  }

  await db
    .insert(organizations)
    .values({ id: DEV_SEED.orgId, name: 'Demo Institution' })
    .onConflictDoNothing({ target: organizations.id });

  const [owner] = await db
    .insert(users)
    .values({
      workosUserId: DEV_SEED.ownerWorkosId,
      email: 'dev@slate.local',
      name: 'Dr. Singh',
    })
    .onConflictDoUpdate({
      target: users.workosUserId,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });

  const [reviewer] = await db
    .insert(users)
    .values({
      workosUserId: DEV_SEED.reviewerWorkosId,
      email: 'reviewer@slate.local',
      name: 'Dr. Okafor',
    })
    .onConflictDoUpdate({
      target: users.workosUserId,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });

  await db
    .insert(reviews)
    .values({
      id: DEV_SEED.reviewId,
      orgId: DEV_SEED.orgId,
      title:
        'SGLT2 inhibitors for heart failure with preserved ejection fraction',
      reviewType: 'Intervention review',
      reviewMode: 'two_reviewer',
      createdBy: owner.id,
    })
    .onConflictDoNothing({ target: reviews.id });

  await db
    .insert(reviewMembers)
    .values([
      {
        reviewId: DEV_SEED.reviewId,
        userId: owner.id,
        role: 'owner',
        status: 'active',
      },
      {
        reviewId: DEV_SEED.reviewId,
        userId: reviewer.id,
        role: 'reviewer',
        status: 'active',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(studies)
    .values([
      {
        id: STUDY_IDS[0],
        reviewId: DEV_SEED.reviewId,
        title:
          'Empagliflozin in Heart Failure with a Preserved Ejection Fraction',
        authors: 'Anker SD, et al.',
        journal: 'N Engl J Med',
        year: 2021,
        doi: '10.1056/NEJMoa2107038',
        source: 'seed',
        externalId: 'PMID:34449189',
      },
      {
        id: STUDY_IDS[1],
        reviewId: DEV_SEED.reviewId,
        title:
          'Dapagliflozin in Heart Failure with Mildly Reduced or Preserved EF',
        authors: 'Solomon SD, et al.',
        journal: 'N Engl J Med',
        year: 2022,
        doi: '10.1056/NEJMoa2206286',
        source: 'seed',
        externalId: 'PMID:36027570',
      },
      {
        id: STUDY_IDS[2],
        reviewId: DEV_SEED.reviewId,
        title:
          'Effects of SGLT2 inhibitors on cardiovascular outcomes: a meta-analysis',
        authors: 'Vaduganathan M, et al.',
        journal: 'Lancet',
        year: 2022,
        doi: '10.1016/S0140-6736(22)01429-5',
        source: 'seed',
        externalId: 'PMID:36116480',
      },
    ])
    .onConflictDoNothing();

  return {
    reviewId: DEV_SEED.reviewId,
    ownerId: owner.id,
    reviewerId: reviewer.id,
    studyCount: STUDY_IDS.length,
  };
}
