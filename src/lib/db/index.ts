import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { getDb } from './client';
import * as schema from './schema';

export { getDb } from './client';
export { schema };

/**
 * Lazy db handle for engine modules that import `{ db }` (e.g.
 * search/domains/user-domain.ts). The connection is created on first property
 * access, so importing this barrel never throws when DATABASE_URL is unset.
 * Slice 1 does not exercise this path at runtime (the route defaults the domain).
 */
export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_target, prop) {
      return Reflect.get(getDb() as object, prop);
    },
  },
);
