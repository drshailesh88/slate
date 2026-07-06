/**
 * Applies Drizzle migrations over Neon's HTTP driver.
 *
 * drizzle-kit's `migrate` uses Neon's websocket driver, which fails silently in
 * some local/sandboxed environments. The neon-http migrator uses plain HTTP and
 * works everywhere the app itself can reach the database.
 */
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

function loadEnvFile(path) {
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const env = {};
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

// Precedence mirrors Next.js: .env.local overrides .env; a real environment
// variable (e.g. injected by CI or op-run) overrides both.
const fromFiles = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  fromFiles.DATABASE_URL_UNPOOLED ||
  fromFiles.DATABASE_URL;

if (!url) {
  console.error(
    'No database URL found. Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local — see .env.example.',
  );
  process.exit(1);
}

try {
  await migrate(drizzle(url), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
