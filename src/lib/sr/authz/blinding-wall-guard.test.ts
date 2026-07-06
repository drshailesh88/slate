// ─────────────────────────────────────────────────────────────────────────────
// BLINDING WALL — STRUCTURAL GUARD  (part of the T6 adversarial suite)
//
// The API-level attacks (blinding-adversarial.test.ts) prove the chokepoint
// refuses to leak. These tests prove the SECOND half of the invariant: that the
// chokepoint is the ONLY reader, and that the Postgres privilege wall migration
// still denies the runtime role.
//
//   • Channel 2 (structural half): a RUNTIME assertion that no blinded-table
//     symbol or read path exists anywhere in `src/` outside the two allowed
//     locations — the schema definition and the chokepoint. This is the same
//     invariant the CI grep (scripts/check-blinded-wall.mjs) and the ESLint
//     no-restricted-imports rule enforce; asserting it here fails the test suite
//     itself the moment a stray COUNT(*)/SELECT on a blinded table lands.
//   • Channel 9 (fast static proxy): assert drizzle/0002_sr_privilege_wall.sql
//     still REVOKEs SELECT and grants ONLY INSERT/UPDATE to slate_runtime on all
//     three blinded tables, and defines the three SECURITY DEFINER readers. The
//     real DB-privilege proof runs against ephemeral Postgres
//     (scripts/test-blinded-wall.sh — `pnpm test:blinded-wall`); this in-suite
//     check is the fast tripwire that catches a weakened migration instantly.
//
// See FOUNDATION-auth-tenancy.md §6.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

// Symbol identifiers (Drizzle table objects) + raw DB table names. Word-boundary
// anchored so `sr_read_screening_decisions` (the definer function) does not
// match the bare table name.
const FORBIDDEN = [
  /\bscreeningDecisions\b/,
  /\bextractionEntries\b/,
  /\brobAssessments\b/,
  /\bscreening_decisions\b/,
  /\bextraction_entries\b/,
  /\brob_assessments\b/,
];

// The only two places allowed to name the blinded tables: their definition and
// the chokepoint that reads them. (This suite lives under the chokepoint dir, so
// its own use of the table names is correctly exempt.)
const ALLOWED_PREFIXES = [
  join('src', 'lib', 'db', 'schema'),
  join('src', 'lib', 'sr', 'authz'),
];

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir: string): string[] {
  let files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full));
    } else if (CODE_EXT.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isAllowed(relPath: string): boolean {
  return ALLOWED_PREFIXES.some(
    (p) => relPath === p || relPath.startsWith(p + sep),
  );
}

describe('Channel 2 (structural) — no blinded read path exists outside the chokepoint', () => {
  it('every reference to a blinded table lives under schema/ or authz/', () => {
    const violations: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const relPath = relative(ROOT, file);
      if (isAllowed(relPath)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
            break;
          }
        }
      });
    }
    // A non-empty list means a COUNT(*)/SELECT/import on a blinded table leaked
    // outside the chokepoint — a genuine wall breach.
    expect(violations).toEqual([]);
  });
});

describe('Channel 9 (static proxy) — the privilege-wall migration still denies the runtime role', () => {
  const wall = readFileSync(
    join(ROOT, 'drizzle', '0002_sr_privilege_wall.sql'),
    'utf8',
  );
  // Strip `--` line comments (incl. the reversible-rollback block, which
  // deliberately shows the SELECT grant you'd run to UNDO the wall) before
  // matching — we assert on the executable SQL, not the documentation.
  const normalized = wall
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join(' ')
    .replace(/\s+/g, ' ');
  const BLINDED = [
    'screening_decisions',
    'extraction_entries',
    'rob_assessments',
  ];

  it('REVOKEs ALL on all three blinded tables from slate_runtime', () => {
    const revoke = normalized.match(
      /REVOKE ALL ON (.*?) FROM slate_runtime/i,
    )?.[1];
    expect(revoke).toBeTruthy();
    for (const table of BLINDED) {
      expect(revoke).toContain(table);
    }
  });

  it('grants the runtime role ONLY INSERT/UPDATE — never SELECT — on the blinded tables', () => {
    const grant = normalized.match(
      /GRANT INSERT, UPDATE ON (.*?) TO slate_runtime/i,
    )?.[1];
    expect(grant).toBeTruthy();
    for (const table of BLINDED) {
      expect(grant).toContain(table);
    }
    // Guard against a future edit re-adding SELECT on a BLINDED table to the
    // runtime role. (Non-blinded tables legitimately grant SELECT to runtime, so
    // the assertion is scoped to the three blinded table names.)
    expect(normalized).not.toMatch(
      /GRANT[^;]*\bSELECT\b[^;]*(screening_decisions|extraction_entries|rob_assessments)[^;]*TO slate_runtime/i,
    );
  });

  it('defines a SECURITY DEFINER reader for each blinded table (the only read path)', () => {
    for (const fn of [
      'sr_read_screening_decisions',
      'sr_read_extraction_entries',
      'sr_read_rob_assessments',
    ]) {
      expect(normalized).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`, 'i'),
      );
    }
    expect(normalized).toMatch(/SECURITY DEFINER/i);
    expect(normalized).toMatch(/SET search_path = pg_catalog/i);
  });
});
