import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, reviews } from '@/lib/db/schema/sr';
import { isScreeningStage, type ScreeningStage } from './stage';

// ─────────────────────────────────────────────────────────────────────────────
// The screening firewall phase lives on `reviews.screening_phase` (a VISIBLE
// column — not blinded). It is read SERVER-SIDE and never trusted from the
// client: the screen cannot spoof "we're in reconcile" to unmask co-reviewers.
//
// The unblind is owner-triggered, one-way, and atomic — a single compare-and-swap
// UPDATE that only flips `independent → reconcile`. A second call (already
// reconcile) matches no row and no-ops, so the reveal can never be re-hidden.
// ─────────────────────────────────────────────────────────────────────────────

export type ScreeningPhase = 'independent' | 'reconcile';

export interface ScreeningFacts {
  reviewId: string;
  title: string;
  reviewType: string;
  phase: ScreeningPhase;
  stage: ScreeningStage;
}

function toPhase(value: string): ScreeningPhase {
  return value === 'reconcile' ? 'reconcile' : 'independent';
}

// Authoritative screening facts for a review. Returns null when the review does
// not exist (the caller — page.tsx — has already proven membership, so a null
// here is a defensive 404, never an authz decision).
export async function loadScreeningFacts(
  reviewId: string,
): Promise<ScreeningFacts | null> {
  const db = getDb();
  const [row] = await db
    .select({
      title: reviews.title,
      reviewType: reviews.reviewType,
      screeningPhase: reviews.screeningPhase,
      screeningStage: reviews.screeningStage,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!row) return null;

  return {
    reviewId,
    title: row.title,
    reviewType: row.reviewType,
    phase: toPhase(row.screeningPhase),
    stage: isScreeningStage(row.screeningStage)
      ? row.screeningStage
      : 'title_abstract',
  };
}

export interface UnblindResult {
  /** True iff THIS call performed the flip (independent → reconcile). */
  flipped: boolean;
}

// Atomically flip screening to `reconcile`. One-way compare-and-swap: the WHERE
// clause requires the current phase to be `independent`, so exactly one call ever
// flips and every later call is a harmless no-op. `reviews` is a visible table,
// so RETURNING is permitted (unlike the blinded tables). The caller (the server
// action) has already gated this on the owner role.
export async function unblindScreening(
  reviewId: string,
  actorId: string,
): Promise<UnblindResult> {
  const db = getDb();
  const flippedRows = await db
    .update(reviews)
    .set({ screeningPhase: 'reconcile' })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.screeningPhase, 'independent'),
      ),
    )
    .returning({ id: reviews.id });

  const flipped = flippedRows.length > 0;

  if (flipped) {
    await db.insert(auditLog).values({
      reviewId,
      actorId,
      action: 'screening.unblind',
      target: `review:${reviewId}`,
      before: { screeningPhase: 'independent' },
      after: { screeningPhase: 'reconcile' },
    });
  }

  return { flipped };
}
