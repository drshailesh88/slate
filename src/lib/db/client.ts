import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | null = null;

// Neon's HTTP driver only speaks to a Neon endpoint. A plain local/docker
// Postgres (used for local dev and the persistence round-trip test) needs the
// node-postgres driver. Production still runs on neon-http with the pooled URL.
function isNeonUrl(url: string): boolean {
  return url.includes('neon.tech') || url.includes('neon.build');
}

export function getDb(): Db {
  if (db) return db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add your Neon pooled connection string to .env.local (see .env.example).',
    );
  }

  if (isNeonUrl(url)) {
    db = drizzleNeon(url, { schema });
  } else {
    // node-postgres and neon-http expose the same query-builder surface for the
    // operations this app uses; the cast keeps callers driver-agnostic.
    db = drizzlePg(new Pool({ connectionString: url }), {
      schema,
    }) as unknown as Db;
  }

  return db;
}
