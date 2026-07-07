import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { extractionEntries } from '@/lib/db/schema/sr-blinded';

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION WRITE CHOKEPOINT (T15) — the ONLY module outside the schema that
// names the blinded `extraction_entries` table for a WRITE. It lives inside the
// wall-allowed src/lib/sr/authz/** so ESLint + the CI grep permit the import.
//
// The Postgres runtime role has INSERT/UPDATE but NO SELECT on the blinded table
// (drizzle/0002_sr_privilege_wall.sql). Two consequences enforced here:
//   1. NO `.returning()` anywhere — RETURNING requires SELECT privilege, which
//      the runtime role lacks. These writes are fire-and-forget by design.
//   2. A reviewer may only touch their OWN rows. `reviewerId` is passed in by the
//      server action as the caller's resolved users.id (never a client value),
//      and every statement is scoped to it. There is no code path here that
//      writes, reads, or reveals another reviewer's or the AI's extraction.
//
// Blinding is unaffected: writing your own value leaks nothing. Reads stay on the
// read chokepoint (blinded-read.ts); this file never SELECTs. The reviewers'
// as-extracted rows are never overwritten by the consensus — that lands in the
// separate, non-blinded extraction_consensus table (see the consensus store).
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractionStateValue =
  'reported' | 'not_reported' | 'na' | 'unclear';

export interface SaveOwnExtractionEntryInput {
  reviewId: string;
  studyId: string;
  fieldId: string;
  /** The caller's OWN internal users.id — set by the server action, never a client value. */
  reviewerId: string;
  value: string | null;
  state: ExtractionStateValue;
  derived: boolean;
  derivedFormula: string | null;
  provenance: unknown;
}

// Upsert the caller's own entry for (review, study, field). Atomic + idempotent
// via the unique index (review_id, study_id, reviewer_id, field_id): a first call
// inserts, a later call revises. `setWhere lockedAt IS NULL` means an entry the
// reviewer has already FINISHED (locked) is not silently rewritten — the update
// simply matches no row. No RETURNING (the runtime role cannot SELECT).
export async function saveOwnExtractionEntry(
  input: SaveOwnExtractionEntryInput,
): Promise<void> {
  const db = getDb();
  await db
    .insert(extractionEntries)
    .values({
      reviewId: input.reviewId,
      studyId: input.studyId,
      fieldId: input.fieldId,
      reviewerId: input.reviewerId,
      value: input.value,
      state: input.state,
      derived: input.derived,
      derivedFormula: input.derivedFormula,
      provenance: input.provenance,
      isAi: false,
    })
    .onConflictDoUpdate({
      target: [
        extractionEntries.reviewId,
        extractionEntries.studyId,
        extractionEntries.reviewerId,
        extractionEntries.fieldId,
      ],
      set: {
        value: input.value,
        state: input.state,
        derived: input.derived,
        derivedFormula: input.derivedFormula,
        provenance: input.provenance,
        updatedAt: new Date(),
      },
      setWhere: isNull(extractionEntries.lockedAt),
    });
}

export interface FinishOwnExtractionInput {
  reviewId: string;
  /** The caller's OWN internal users.id — set by the server action. */
  reviewerId: string;
}

// Finish extraction for the caller: lock every one of THEIR OWN as-yet-unlocked
// entries. Locking feeds the chokepoint's safe-progress ("N of M reviewers
// finished") and freezes the reviewer's values ahead of reconciliation — the
// FIREWALL gate (co-reviewer/AI data stays inaccessible until BOTH lock). Scoped
// strictly to `reviewer_id = caller` and `locked_at IS NULL`; it can never touch
// another reviewer's rows. No RETURNING.
export async function finishOwnExtraction(
  input: FinishOwnExtractionInput,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(extractionEntries)
    .set({ lockedAt: now, updatedAt: now })
    .where(
      and(
        eq(extractionEntries.reviewId, input.reviewId),
        eq(extractionEntries.reviewerId, input.reviewerId),
        isNull(extractionEntries.lockedAt),
      ),
    );
}
