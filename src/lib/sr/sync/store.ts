import type { MembershipData, OrgData, UserData } from './types';

// Persistence port for the WorkOS → Neon mirror sync.
//
// process-event.ts depends only on this interface. The real Drizzle-backed
// implementation lives in ./drizzle-store.ts; tests supply an in-memory fake so
// the ledger, dedup, and no-resurrect logic can be exercised without a database.

export type LedgerState = {
  // The event's processedAt, or null if received-but-not-yet-processed.
  processedAt: Date | null;
} | null; // null when the eventId has never been seen.

export type MirroredUser = {
  deletedAt: Date | null;
} | null; // null when the user is not mirrored yet.

export interface SyncStore {
  // ── Event ledger (idempotency) ─────────────────────────────────────────────
  getEventState(eventId: string): Promise<LedgerState>;
  recordEventReceipt(eventId: string, type: string): Promise<void>;
  markEventProcessed(eventId: string): Promise<void>;

  // ── Mirror reads ────────────────────────────────────────────────────────────
  getUserByWorkosId(workosUserId: string): Promise<MirroredUser>;

  // ── Mirror writes (all idempotent) ──────────────────────────────────────────
  upsertOrganization(org: OrgData): Promise<void>;
  // Upserts the user mirror. MUST NOT resurrect a tombstoned row.
  mirrorUser(user: UserData): Promise<void>;
  // GDPR: anonymize PII + set deletedAt, keep the row, and inactivate the
  // user's review access. NEVER touches scientific records.
  tombstoneUser(workosUserId: string): Promise<void>;
  // Org-membership removal → inactivate that user's access to the org's reviews.
  // Never grants access.
  inactivateOrgReviewAccess(membership: MembershipData): Promise<void>;
}
