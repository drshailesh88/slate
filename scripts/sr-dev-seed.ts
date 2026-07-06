/**
 * Seeds a demo systematic review into the database (dev/test only).
 *
 * Run:  pnpm sr:seed
 *
 * Loads DATABASE_URL from .env.local / .env (same precedence as the migrate
 * script), refuses to run in production, and inserts the demo review + owner/
 * reviewer members + a few studies as real rows via seedDevReview().
 */
import { readFileSync } from 'node:fs';
import { seedDevReview, DEV_SEED } from '../src/lib/sr/dev-seed';

function loadEnvFile(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fromFiles = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
process.env.DATABASE_URL =
  process.env.DATABASE_URL || fromFiles.DATABASE_URL || '';

if (!process.env.DATABASE_URL) {
  console.error(
    'No DATABASE_URL found. Set it in .env.local (pooled Neon URL) — see .env.example.',
  );
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production.');
  process.exit(1);
}

async function main(): Promise<void> {
  const result = await seedDevReview();
  console.log('Seeded demo review.');
  console.log(`  reviewId:   ${result.reviewId}`);
  console.log(`  studies:    ${result.studyCount}`);
  console.log(`  owner:      ${DEV_SEED.ownerWorkosId} (Dr. Singh)`);
  console.log(`  open:       /systematic-review/${result.reviewId}`);
}

main().catch((error) => {
  console.error(
    'Seed failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
