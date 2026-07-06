import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CanvasEdge, CanvasNode } from '../reading-room/canvas-types';

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
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// A stub of the Library's Source object. The Reading Room references these by
// ID from the canvas — it never owns or clones source truth (doctrine §3).
export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  authors: text('authors'),
  venue: text('venue'),
  year: integer('year'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

// One synthesis canvas per Reading Room. `nodes`/`edges` hold ONLY layout +
// graph + foreign keys (see canvas-types.ts) — never a content payload. This is
// the whole point of the P0 spike: prove reference-not-clone + persistence.
export const readingRoomCanvas = pgTable('reading_room_canvas', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: text('room_id').notNull().unique(),
  nodes: jsonb('nodes').$type<CanvasNode[]>().notNull().default([]),
  edges: jsonb('edges').$type<CanvasEdge[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ReadingRoomCanvas = typeof readingRoomCanvas.$inferSelect;
export type NewReadingRoomCanvas = typeof readingRoomCanvas.$inferInsert;
