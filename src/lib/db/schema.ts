import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  workosUserId: text('workos_user_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // GDPR tombstone: set on a WorkOS `user.deleted` event. The row is kept (so
  // scientific-record FKs stay valid) and its PII is anonymized. A non-null
  // value also blocks a stale `user.updated` from resurrecting the mirror.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Systematic-Review module schema (enums, visible tables, and the three blinded
// base tables). Kept in ./schema/* to keep files small; re-exported here so the
// drizzle client barrel and drizzle-kit discover every table through one entry.
export * from './schema/sr';
