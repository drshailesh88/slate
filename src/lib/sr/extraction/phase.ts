import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, reviews } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// The extraction firewall phase lives on `reviews.extraction_phase` (a VISIBLE
// column — not blinded), read SERVER-SIDE and never trusted from the client: the
// screen cannot spoof "we're in reconcile" to unmask co-reviewers or the AI.
//
// The unblind is owner-triggered, one-way, and atomic — a single compare-and-swap
// UPDATE that only flips `independent → reconcile`. A second call (already
// reconcile) matches no row and no-ops, so the reveal can never be re-hidden.
// Independent of screening_phase / rob_phase (an owner unblinds one surface at a
// time).
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractionPhase = 'independent' | 'reconcile';

export interface ExtractionFacts {
  reviewId: string;
  title: string;
  reviewType: string;
  phase: ExtractionPhase;
  qcSampleRate: number;
}

function toPhase(value: string): ExtractionPhase {
  return value === 'reconcile' ? 'reconcile' : 'independent';
}

// Authoritative extraction facts for a review. Returns null when the review does
// not exist (the caller has already proven membership, so a null here is a
// defensive 404, never an authz decision).
export async function loadExtractionFacts(
  reviewId: string,
): Promise<ExtractionFacts | null> {
  const db = getDb();
  const [row] = await db
    .select({
      title: reviews.title,
      reviewType: reviews.reviewType,
      extractionPhase: reviews.extractionPhase,
      qcSampleRate: reviews.extractionQcSampleRate,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!row) return null;

  return {
    reviewId,
    title: row.title,
    reviewType: row.reviewType,
    phase: toPhase(row.extractionPhase),
    qcSampleRate: row.qcSampleRate,
  };
}

export interface UnblindResult {
  /** True iff THIS call performed the flip (independent → reconcile). */
  flipped: boolean;
}

// Atomically flip extraction to `reconcile`. One-way compare-and-swap: the WHERE
// clause requires the current phase to be `independent`, so exactly one call ever
// flips and every later call is a harmless no-op. `reviews` is visible, so
// RETURNING is permitted. The caller (the server action) has already gated this
// on the owner role.
export async function unblindExtraction(
  reviewId: string,
  actorId: string,
): Promise<UnblindResult> {
  const db = getDb();
  const flippedRows = await db
    .update(reviews)
    .set({ extractionPhase: 'reconcile' })
    .where(
      and(eq(reviews.id, reviewId), eq(reviews.extractionPhase, 'independent')),
    )
    .returning({ id: reviews.id });

  const flipped = flippedRows.length > 0;

  if (flipped) {
    await db.insert(auditLog).values({
      reviewId,
      actorId,
      action: 'extraction.unblind',
      target: `review:${reviewId}`,
      before: { extractionPhase: 'independent' },
      after: { extractionPhase: 'reconcile' },
    });
  }

  return { flipped };
}
