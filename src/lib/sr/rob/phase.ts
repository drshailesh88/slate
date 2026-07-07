import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, reviews } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// The Risk-of-Bias firewall phase lives on `reviews.rob_phase` (a VISIBLE column
// — not blinded). It is read SERVER-SIDE and never trusted from the client: the
// screen cannot spoof "we're in reconcile" to unmask a co-reviewer's or the AI's
// domain judgement.
//
// The unblind is owner-triggered, one-way, and atomic — a single compare-and-swap
// UPDATE that only flips `independent → reconcile`. A second call (already
// reconcile) matches no row and no-ops, so the reveal can never be re-hidden.
// Mirrors screening/phase.ts (T12), scoped to the RoB surface.
// ─────────────────────────────────────────────────────────────────────────────

export type RobPhase = 'independent' | 'reconcile';

export interface RobFacts {
  reviewId: string;
  title: string;
  reviewType: string;
  phase: RobPhase;
}

function toPhase(value: string): RobPhase {
  return value === 'reconcile' ? 'reconcile' : 'independent';
}

// Authoritative RoB facts for a review. Returns null when the review does not
// exist (the caller — page.tsx — has already proven membership, so a null here
// is a defensive 404, never an authz decision).
export async function loadRobFacts(reviewId: string): Promise<RobFacts | null> {
  const db = getDb();
  const [row] = await db
    .select({
      title: reviews.title,
      reviewType: reviews.reviewType,
      robPhase: reviews.robPhase,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!row) return null;

  return {
    reviewId,
    title: row.title,
    reviewType: row.reviewType,
    phase: toPhase(row.robPhase),
  };
}

export interface UnblindRobResult {
  /** True iff THIS call performed the flip (independent → reconcile). */
  flipped: boolean;
}

// Atomically flip RoB to `reconcile`. One-way compare-and-swap: the WHERE clause
// requires the current phase to be `independent`, so exactly one call ever flips
// and every later call is a harmless no-op. `reviews` is a visible table, so
// RETURNING is permitted (unlike the blinded tables). The caller (the server
// action) has already gated this on the owner role.
export async function unblindRob(
  reviewId: string,
  actorId: string,
): Promise<UnblindRobResult> {
  const db = getDb();
  const flippedRows = await db
    .update(reviews)
    .set({ robPhase: 'reconcile' })
    .where(and(eq(reviews.id, reviewId), eq(reviews.robPhase, 'independent')))
    .returning({ id: reviews.id });

  const flipped = flippedRows.length > 0;

  if (flipped) {
    await db.insert(auditLog).values({
      reviewId,
      actorId,
      action: 'rob.unblind',
      target: `review:${reviewId}`,
      before: { robPhase: 'independent' },
      after: { robPhase: 'reconcile' },
    });
  }

  return { flipped };
}
