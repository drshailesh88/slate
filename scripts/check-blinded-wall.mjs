#!/usr/bin/env node
/**
 * CI guard for the SR blinding wall.
 *
 * Fails the build if any of the three blinded base tables is referenced outside
 * the two places allowed to name them:
 *   - src/lib/db/schema/**      (where they are DEFINED)
 *   - src/lib/sr/authz/**       (the blinding chokepoint — the only reader)
 *
 * This is the third layer of defense behind the Postgres privilege wall and the
 * ESLint no-restricted-imports rule. See FOUNDATION-auth-tenancy.md §6.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIR = join(ROOT, 'src');

// Symbol identifiers (Drizzle table objects) + raw DB table names.
const FORBIDDEN = [
  /\bscreeningDecisions\b/,
  /\bextractionEntries\b/,
  /\brobAssessments\b/,
  /\bscreening_decisions\b/,
  /\bextraction_entries\b/,
  /\brob_assessments\b/,
];

// Paths allowed to name the blinded tables (definition + the chokepoint).
const ALLOWED_PREFIXES = [
  join('src', 'lib', 'db', 'schema'),
  join('src', 'lib', 'sr', 'authz'),
];

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir) {
  let files = [];
  let entries;
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

function isAllowed(relPath) {
  return ALLOWED_PREFIXES.some((p) => relPath.startsWith(p));
}

const violations = [];
for (const file of walk(SCAN_DIR)) {
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

if (violations.length > 0) {
  console.error(
    'BLINDING WALL VIOLATION — a blinded SR table is named outside\n' +
      '  src/lib/db/schema/** (definition) or src/lib/sr/authz/** (chokepoint).\n' +
      'Blinded data (screening_decisions, extraction_entries, rob_assessments)\n' +
      'may ONLY be read through the blinding chokepoint. See\n' +
      'FOUNDATION-auth-tenancy.md §6.\n',
  );
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log(
  'Blinding wall guard: OK (no blinded-table references outside the allowed modules).',
);
