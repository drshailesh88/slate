/**
 * Dev-only: serve an ephemeral PGlite (real Postgres, in-process) over the
 * Postgres wire protocol so `pnpm dev` can round-trip the canvas locally with
 * no live Neon creds and no docker daemon. Point DATABASE_URL at it:
 *
 *   postgres://postgres:postgres@127.0.0.1:5433/postgres
 *
 * Data lives in this process, so it survives browser reloads while the server
 * stays up. Not for production — production uses neon-http.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PGLITE_PORT ?? 5433);

const db = await PGlite.create();

const dir = join(process.cwd(), 'drizzle');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
for (const file of files) {
  await db.exec(readFileSync(join(dir, file), 'utf8'));
}
console.log(`Applied ${files.length} migration file(s).`);

const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: '127.0.0.1',
  debug: process.env.PGLITE_DEBUG === '1',
});
await server.start();
console.log(`pglite-socket listening on 127.0.0.1:${PORT}`);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
