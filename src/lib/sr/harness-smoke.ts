/**
 * Harness smoke helper — a pure function the T5 test bootstrap asserts against
 * to prove `pnpm test` runs green. Real SR derivations land in sibling modules
 * (`authz/**`, etc.) owned by the other M1 tasks.
 */
export function totalScreened(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}
