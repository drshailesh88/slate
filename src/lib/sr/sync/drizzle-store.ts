import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  organizations,
  reviewMembers,
  reviews,
  users,
  workosEvents,
} from '@/lib/db/schema';
import type { LedgerState, MirroredUser, SyncStore } from './store';
import type { MembershipData, OrgData, UserData } from './types';

type Database = ReturnType<typeof getDb>;

// Neon-http-backed SyncStore. The neon-http driver runs each statement as its
// own request (no interactive transactions), so every method below is a single
// idempotent statement or a short read-then-write whose writes are idempotent.
export class DrizzleSyncStore implements SyncStore {
  constructor(private readonly db: Database = getDb()) {}

  async getEventState(eventId: string): Promise<LedgerState> {
    const [row] = await this.db
      .select({ processedAt: workosEvents.processedAt })
      .from(workosEvents)
      .where(eq(workosEvents.eventId, eventId))
      .limit(1);
    return row ? { processedAt: row.processedAt } : null;
  }

  async recordEventReceipt(eventId: string, type: string): Promise<void> {
    await this.db
      .insert(workosEvents)
      .values({ eventId, type })
      .onConflictDoNothing({ target: workosEvents.eventId });
  }

  async markEventProcessed(eventId: string): Promise<void> {
    await this.db
      .update(workosEvents)
      .set({ processedAt: new Date() })
      .where(eq(workosEvents.eventId, eventId));
  }

  async getUserByWorkosId(workosUserId: string): Promise<MirroredUser> {
    const [row] = await this.db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.workosUserId, workosUserId))
      .limit(1);
    return row ? { deletedAt: row.deletedAt } : null;
  }

  async upsertOrganization({ organizationId, name }: OrgData): Promise<void> {
    await this.db
      .insert(organizations)
      .values({ id: organizationId, name })
      .onConflictDoUpdate({ target: organizations.id, set: { name } });
  }

  async mirrorUser({ workosUserId, email, name }: UserData): Promise<void> {
    // DO UPDATE only when the row is not tombstoned — the DB-level backstop for
    // the no-resurrect rule enforced in process-event.ts.
    await this.db
      .insert(users)
      .values({ workosUserId, email, name })
      .onConflictDoUpdate({
        target: users.workosUserId,
        set: { email, name, updatedAt: new Date() },
        setWhere: isNull(users.deletedAt),
      });
  }

  async tombstoneUser(workosUserId: string): Promise<void> {
    const now = new Date();
    const [tombstoned] = await this.db
      .update(users)
      .set({ email: '', name: null, deletedAt: now, updatedAt: now })
      .where(and(eq(users.workosUserId, workosUserId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!tombstoned) return;

    await this.db
      .update(reviewMembers)
      .set({ status: 'inactive', updatedAt: now })
      .where(
        and(
          eq(reviewMembers.userId, tombstoned.id),
          ne(reviewMembers.status, 'inactive'),
        ),
      );
  }

  async inactivateOrgReviewAccess({
    organizationId,
    workosUserId,
  }: MembershipData): Promise<void> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.workosUserId, workosUserId))
      .limit(1);
    if (!user) return;

    const orgReviews = await this.db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.orgId, organizationId));
    const reviewIds = orgReviews.map((r) => r.id);
    if (reviewIds.length === 0) return;

    await this.db
      .update(reviewMembers)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(
        and(
          eq(reviewMembers.userId, user.id),
          inArray(reviewMembers.reviewId, reviewIds),
          ne(reviewMembers.status, 'inactive'),
        ),
      );
  }
}
