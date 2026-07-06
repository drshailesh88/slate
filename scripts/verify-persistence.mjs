/**
 * Persistence round-trip for the Reading Room synthesis canvas, against a real
 * local/ephemeral Postgres (no live Neon creds). Proves the P0 invariants:
 *
 *   1. The additive migration applies cleanly.
 *   2. Canvas nodes persist as REFERENCES (a type + a foreign key), never a
 *      content payload — no source title/authors is stored on the node.
 *   3. Deleting a canvas deletes only the arrangement: the referenced Source
 *      row survives. Reference-not-clone.
 *
 * Postgres backend:
 *   - If DATABASE_URL is set (e.g. via scripts/verify-persistence.sh, which
 *     manages a docker Postgres), it connects with node-postgres.
 *   - Otherwise it spins an in-process PGlite (a WASM build of real Postgres) —
 *     no daemon required. Either way it is genuine Postgres with real jsonb.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = 'spike-room-1';

const NODE_KEYS = ['id', 'type', 'position', 'ref', 'config'];
const PAYLOAD_LEAK_KEYS = ['title', 'authors', 'venue', 'year', 'source'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

function migrationStatements(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((file) =>
      readFileSync(join(dir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean),
    );
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    console.log('Backend: node-postgres →', url.replace(/:[^:@/]+@/, ':***@'));
    return {
      query: (sql, params) => client.query(sql, params),
      end: () => client.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  console.log('Backend: PGlite (in-process ephemeral Postgres)');
  return {
    query: (sql, params) => db.query(sql, params),
    end: () => db.close(),
  };
}

async function run() {
  const db = await connect();
  try {
    console.log('\nApplying migrations…');
    for (const statement of migrationStatements(
      join(process.cwd(), 'drizzle'),
    )) {
      await db.query(statement);
    }

    console.log(
      '\nSeeding a Source (owned by the Library, referenced by canvas)…',
    );
    await db.query(
      `INSERT INTO sources (id, title, authors, venue, year)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [
        SOURCE_ID,
        'Attention Is All You Need',
        'Vaswani et al.',
        'NeurIPS',
        2017,
      ],
    );

    console.log(
      '\nSaving a canvas — nodes hold refs (FKs) only, plus one edge…',
    );
    const nodes = [
      {
        id: 'n-source',
        type: 'source',
        position: { x: 80, y: 80 },
        ref: { kind: 'source', id: SOURCE_ID },
        config: {},
      },
      {
        id: 'n-synth',
        type: 'synthesis',
        position: { x: 460, y: 120 },
        ref: null,
        config: { prompt: 'Summarize the connected source.' },
      },
    ];
    const edges = [{ id: 'e1', source: 'n-source', target: 'n-synth' }];
    await db.query(
      `INSERT INTO reading_room_canvas (room_id, nodes, edges)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id) DO UPDATE SET nodes = $2, edges = $3`,
      [ROOM_ID, JSON.stringify(nodes), JSON.stringify(edges)],
    );

    console.log('\nRehydrating and asserting the invariants…');
    const { rows } = await db.query(
      `SELECT nodes, edges FROM reading_room_canvas WHERE room_id = $1`,
      [ROOM_ID],
    );
    assert(rows.length === 1, 'canvas row round-trips for the room');

    const savedNodes = rows[0].nodes;
    const savedEdges = rows[0].edges;
    assert(savedNodes.length === 2, 'both nodes persisted');
    assert(savedEdges.length === 1, 'the source→synthesis edge persisted');
    assert(
      savedEdges[0].source === 'n-source' && savedEdges[0].target === 'n-synth',
      'edge connects source card to synthesis node',
    );

    const sourceNode = savedNodes.find((n) => n.type === 'source');
    assert(
      sourceNode.ref?.kind === 'source' && sourceNode.ref.id === SOURCE_ID,
      'source node stores a foreign key to the Source id',
    );
    for (const node of savedNodes) {
      const extraKeys = Object.keys(node).filter((k) => !NODE_KEYS.includes(k));
      assert(
        extraKeys.length === 0,
        `node "${node.id}" has only ref/layout keys (extras: ${extraKeys.join(', ') || 'none'})`,
      );
      const leaked = PAYLOAD_LEAK_KEYS.filter((k) => k in node);
      assert(
        leaked.length === 0,
        `node "${node.id}" carries no content payload (leaked: ${leaked.join(', ') || 'none'})`,
      );
    }

    console.log('\nDeleting the canvas — the referenced Source must survive…');
    await db.query(`DELETE FROM reading_room_canvas WHERE room_id = $1`, [
      ROOM_ID,
    ]);
    const sourceCheck = await db.query(
      `SELECT id, title FROM sources WHERE id = $1`,
      [SOURCE_ID],
    );
    assert(
      sourceCheck.rows.length === 1 &&
        sourceCheck.rows[0].title === 'Attention Is All You Need',
      'Source row survives canvas deletion (reference-not-clone)',
    );

    console.log(
      '\n✅ PASS — persistence round-trips as references, not clones.',
    );
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ FAIL — ${error.message}`);
    await db.end().catch(() => {});
    process.exit(1);
  }
}

run();
