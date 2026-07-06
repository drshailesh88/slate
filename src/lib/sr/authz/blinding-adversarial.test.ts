// ─────────────────────────────────────────────────────────────────────────────
// THE ADVERSARIAL BLINDING SUITE  —  M1 EXIT GATE  (SR Task T6)
//
// Every test here is a GENUINE ATTACK: it primes the database so a co-reviewer's
// decision / extraction / RoB value is physically present in the rows the DB
// hands back, then proves that value can NEVER reach the caller through the
// channel under test while the surface is `independent`. If the blinding
// boundary were wrong (e.g. the chokepoint returned `all` during independent, or
// forgot to filter), these attacks would SUCCEED and leak. They must all fail to
// leak.
//
// The three blinded surfaces are read ONLY through the chokepoint public API
// (getScreeningDecisions / getExtractionEntries / getRobAssessments /
// getScreeningTally / getSafeProgress). We attack THROUGH that API — never by
// importing the blinded tables directly — because every real caller (export,
// search, progress, reconcile view, owner preview) is forced through it by the
// Postgres privilege wall + ESLint + CI grep (see blinding-wall-guard.test.ts).
//
// Channels covered here (the DB-privilege backstop is channel 9, proven by
// scripts/test-blinded-wall.sh against ephemeral Postgres):
//   1. Direct read            5. Cached counters
//   2. Aggregate / progress   6. Reconciliation view
//   3. Export                 7. Admin / owner preview
//   4. Full-text search       8. Phase-transition window (TOCTOU)
//
// See FOUNDATION-auth-tenancy.md §6 and sr-build-plan-p4/report.md §2.5.
// ─────────────────────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getExtractionEntries,
  getRobAssessments,
  getSafeProgress,
  getScreeningDecisions,
  getScreeningTally,
  type BlindedContext,
  type ReviewRole,
} from './blinded-read';
import { resolveRowVisibility } from './policy';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const LOCKED = '2026-01-01T00:00:00Z';

// Distinctive markers that live ONLY on the co-reviewer's rows. A leak through
// any channel would carry at least one of these into the caller's output, so
// every attack asserts they are absent during independent — and present at
// reconcile (a positive control that proves the assertion can actually detect a
// leak, rather than passing vacuously).
const SECRET_EXCLUDE_REASON = 'SECRET_PARTNER_EXCLUDE_REASON';
const SECRET_EXTRACTION_VALUE = 'SECRET_PARTNER_VALUE_42';
const SECRET_ROB_QUOTE = 'SECRET_PARTNER_ROB_QUOTE';
const SECRETS = [
  SECRET_EXCLUDE_REASON,
  SECRET_EXTRACTION_VALUE,
  SECRET_ROB_QUOTE,
  OTHER,
];

// The DB definer functions (sr_read_*) return EVERY row for the review — they do
// not filter by reviewer. So the raw set the chokepoint receives always contains
// the co-reviewer's row. Blinding is the chokepoint's job, and that is exactly
// what we attack.
const screeningRaw = [
  {
    id: 's1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    stage: 'title_abstract',
    decision: 'include',
    exclude_reason_code: null,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 's2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    stage: 'title_abstract',
    decision: 'exclude',
    exclude_reason_code: 'wrong_population',
    exclude_reason_detail: SECRET_EXCLUDE_REASON,
    is_ai: false,
    locked_at: null,
  },
];

const extractionRaw = [
  {
    id: 'e1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: SELF,
    value: '120',
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: 4 },
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 'e2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: OTHER,
    value: SECRET_EXTRACTION_VALUE,
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: 4 },
    is_ai: false,
    locked_at: null,
  },
];

const robRaw = [
  {
    id: 'b1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    domain: 'randomization',
    judgement: 'low',
    support_quote: 'Computer-generated sequence.',
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 'b2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    domain: 'randomization',
    judgement: 'high',
    support_quote: SECRET_ROB_QUOTE,
    is_ai: false,
    locked_at: null,
  },
];

const AUTHORING_ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
];
const ALL_ROLES: ReviewRole[] = [...AUTHORING_ROLES, 'viewer'];

// Mock getDb().execute to answer, in call order, the queued responses.
function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(role: ReviewRole, requesterId = SELF): BlindedContext {
  return { reviewId: REVIEW_ID, requesterId, role };
}

// A leak-detector: no marker that belongs only to the co-reviewer may appear.
function expectNoPartnerData(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const secret of SECRETS) {
    expect(serialized).not.toContain(secret);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

// The three blinded surfaces, each with its reader and raw set.
const SURFACES = [
  { surface: 'screening', getter: getScreeningDecisions, raw: screeningRaw },
  { surface: 'extraction', getter: getExtractionEntries, raw: extractionRaw },
  { surface: 'rob', getter: getRobAssessments, raw: robRaw },
] as const;

// ─── Channel 1 — DIRECT READ ─────────────────────────────────────────────────
// Attack: read a blinded surface during independent and try to see the
// co-reviewer's row. Owner and arbitrator get NO peek either.
describe('Channel 1 — direct read cannot surface a co-reviewer row (independent)', () => {
  for (const { surface, getter, raw } of SURFACES) {
    for (const role of AUTHORING_ROLES) {
      it(`${surface}: role=${role} sees only own rows, never the partner`, async () => {
        primeDb({ rows: [{ phase: 'independent' }] }, { rows: raw });
        const out = await getter(ctx(role));
        expect(out.every((r) => r.reviewerId === SELF)).toBe(true);
        expect(out.some((r) => r.reviewerId === OTHER)).toBe(false);
        expectNoPartnerData(out);
      });
    }

    it(`${surface}: a viewer is denied outright during independent`, async () => {
      primeDb({ rows: [{ phase: 'independent' }] });
      await expect(getter(ctx('viewer'))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
    });

    // Positive control: the leak-detector is not vacuous — at reconcile the
    // partner row (and its secret) is intentionally visible.
    it(`${surface}: partner row DOES surface at reconcile (control)`, async () => {
      primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: raw });
      const out = await getter(ctx('owner'));
      expect(out.some((r) => r.reviewerId === OTHER)).toBe(true);
      expect(JSON.stringify(out)).toContain(OTHER);
    });
  }
});

// ─── Channel 2 — AGGREGATE / PROGRESS LEAK ───────────────────────────────────
// Attack: infer the partner's decisions from a count, a distribution, or the
// progress surface during independent.
describe('Channel 2 — aggregates and progress cannot leak partner data (independent)', () => {
  it('getScreeningTally is refused for EVERY role during independent', async () => {
    for (const role of ALL_ROLES) {
      primeDb({ rows: [{ phase: 'independent' }] });
      await expect(getScreeningTally(ctx(role))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
    }
  });

  it('getSafeProgress emits completion counts ONLY — no distribution, no partner', async () => {
    // Partner has authored an unlocked `exclude`; a leak would let me infer it.
    primeDb(
      { rows: [{ user_id: SELF }, { user_id: OTHER }, { user_id: 'user-3' }] },
      { rows: screeningRaw },
      { rows: extractionRaw },
      { rows: robRaw },
    );

    const progress = await getSafeProgress(REVIEW_ID);

    for (const s of ['screening', 'extraction', 'rob'] as const) {
      expect(Object.keys(progress[s]).sort()).toEqual([
        'finishedReviewers',
        'totalReviewers',
      ]);
      expect(typeof progress[s].finishedReviewers).toBe('number');
      expect(typeof progress[s].totalReviewers).toBe('number');
    }
    // No decision term and no partner marker survives into the progress shape.
    const serialized = JSON.stringify(progress);
    expect(serialized).not.toContain('include');
    expect(serialized).not.toContain('exclude');
    expect(serialized).not.toContain('maybe');
    expectNoPartnerData(progress);
  });

  it('getScreeningTally computes only once the surface is at reconcile (control)', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const tally = await getScreeningTally(ctx('owner'));
    expect(tally).toEqual({ include: 1, exclude: 1, maybe: 0, total: 2 });
  });
});

// ─── Channel 3 — EXPORT ──────────────────────────────────────────────────────
// An export is just another consumer of the chokepoint. Model an exporter that
// pulls all three surfaces (as the owner would) and serialises to CSV. During
// independent it must contain ONLY the caller's own rows.
describe('Channel 3 — an export during independent contains only the caller own rows', () => {
  async function exportAsCsv(role: ReviewRole): Promise<string> {
    // Sequential reads (phase→rows per surface) — one deterministic exporter.
    const screening = await getScreeningDecisions(ctx(role));
    const extraction = await getExtractionEntries(ctx(role));
    const rob = await getRobAssessments(ctx(role));
    const lines: string[] = [];
    for (const r of screening)
      lines.push(
        `screening,${r.reviewerId},${r.decision},${r.excludeReasonDetail ?? ''}`,
      );
    for (const r of extraction)
      lines.push(`extraction,${r.reviewerId},${r.value ?? ''}`);
    for (const r of rob)
      lines.push(`rob,${r.reviewerId},${r.judgement},${r.supportQuote ?? ''}`);
    return lines.join('\n');
  }

  it('owner export carries no co-reviewer row or value', async () => {
    // Three getters, each: phase read + rows read = 6 queued responses.
    primeDb(
      { rows: [{ phase: 'independent' }] },
      { rows: screeningRaw },
      { rows: [{ phase: 'independent' }] },
      { rows: extractionRaw },
      { rows: [{ phase: 'independent' }] },
      { rows: robRaw },
    );

    const csv = await exportAsCsv('owner');

    expect(csv).toContain(SELF);
    expect(csv).not.toContain(OTHER);
    expect(csv).not.toContain(SECRET_EXCLUDE_REASON);
    expect(csv).not.toContain(SECRET_EXTRACTION_VALUE);
    expect(csv).not.toContain(SECRET_ROB_QUOTE);
  });

  it('an export cannot smuggle summary counts through the tally during independent', async () => {
    primeDb({ rows: [{ phase: 'independent' }] });
    await expect(getScreeningTally(ctx('owner'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
  });

  it('at reconcile the export intentionally includes the partner (control)', async () => {
    primeDb(
      { rows: [{ phase: 'reconcile' }] },
      { rows: screeningRaw },
      { rows: [{ phase: 'reconcile' }] },
      { rows: extractionRaw },
      { rows: [{ phase: 'reconcile' }] },
      { rows: robRaw },
    );
    const csv = await exportAsCsv('owner');
    expect(csv).toContain(OTHER);
    expect(csv).toContain(SECRET_EXTRACTION_VALUE);
  });
});

// ─── Channel 4 — FULL-TEXT SEARCH ────────────────────────────────────────────
// Attack: search for a token that exists ONLY in the partner's row. Because the
// searchable corpus is built from chokepoint-filtered rows, the partner's text
// is never in it during independent, so the query returns nothing.
describe('Channel 4 — full-text search cannot surface a blinded value (independent)', () => {
  async function searchExtraction(
    role: ReviewRole,
    term: string,
  ): Promise<Array<{ reviewerId: string; value: string | null }>> {
    const rows = await getExtractionEntries(ctx(role));
    return rows
      .filter((r) => (r.value ?? '').includes(term))
      .map((r) => ({ reviewerId: r.reviewerId, value: r.value }));
  }

  it('searching a partner-only token yields no hits during independent', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: extractionRaw });
    const hits = await searchExtraction('reviewer', SECRET_EXTRACTION_VALUE);
    expect(hits).toHaveLength(0);
  });

  it('search still finds the caller own value (search itself works)', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: extractionRaw });
    const hits = await searchExtraction('reviewer', '120');
    expect(hits).toHaveLength(1);
    expect(hits[0].reviewerId).toBe(SELF);
  });

  it('the partner token becomes searchable only at reconcile (control)', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: extractionRaw });
    const hits = await searchExtraction('owner', SECRET_EXTRACTION_VALUE);
    expect(hits).toHaveLength(1);
    expect(hits[0].reviewerId).toBe(OTHER);
  });
});

// ─── Channel 5 — CACHED COUNTERS ─────────────────────────────────────────────
// Attack: a memoised counter serves a stale value across the phase flip. The
// chokepoint re-reads the authoritative phase on EVERY call, so a denial can
// never be cached into a value, and gating always busts on the flip.
describe('Channel 5 — cached / memoised counters bust on the phase flip', () => {
  it('a naive memoiser cannot turn an independent denial into a served count', async () => {
    const cache = new Map<string, unknown>();
    async function cachedTally(c: BlindedContext) {
      if (cache.has(c.reviewId)) return cache.get(c.reviewId);
      const tally = await getScreeningTally(c); // throws during independent
      cache.set(c.reviewId, tally);
      return tally;
    }

    primeDb({ rows: [{ phase: 'independent' }] });
    await expect(cachedTally(ctx('owner'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
    // Nothing was cached — the deny is not a value.
    expect(cache.has(REVIEW_ID)).toBe(false);
  });

  it('the chokepoint re-reads phase every call, so the flip changes the answer', async () => {
    // Call 1: still independent → refused.
    primeDb({ rows: [{ phase: 'independent' }] });
    await expect(getScreeningTally(ctx('owner'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );

    // Call 2 (same review, owner flipped it): reconcile → now permitted.
    const execute = primeDb(
      { rows: [{ phase: 'reconcile' }] },
      { rows: screeningRaw },
    );
    const tally = await getScreeningTally(ctx('owner'));
    expect(tally.total).toBe(2);
    // Proof it re-read phase: the first query of this call was the phase lookup.
    expect(execute.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('getSafeProgress recomputes from fresh rows on each call (no frozen count)', async () => {
    primeDb(
      { rows: [{ user_id: SELF }, { user_id: OTHER }] },
      { rows: screeningRaw }, // SELF locked, OTHER open → 1 finished
      { rows: [] },
      { rows: [] },
    );
    const first = await getSafeProgress(REVIEW_ID);
    expect(first.screening.finishedReviewers).toBe(1);

    // Later, the partner has locked too → recomputed to 2, not a stale 1.
    const bothLocked = [
      screeningRaw[0],
      { ...screeningRaw[1], locked_at: LOCKED },
    ];
    primeDb(
      { rows: [{ user_id: SELF }, { user_id: OTHER }] },
      { rows: bothLocked },
      { rows: [] },
      { rows: [] },
    );
    const second = await getSafeProgress(REVIEW_ID);
    expect(second.screening.finishedReviewers).toBe(2);
  });
});

// ─── Channel 6 — RECONCILIATION VIEW ─────────────────────────────────────────
// Co-reviewer data appears ONLY after the owner-triggered flip to reconcile —
// never during independent. The gate is the authoritative `reviews` phase.
describe('Channel 6 — the reconciliation view is empty of partner data until reconcile', () => {
  it('during independent the reconcile view (all rows + tally) is refused/own-only', async () => {
    // Rows read: own-only.
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: screeningRaw });
    const rows = await getScreeningDecisions(ctx('owner'));
    expect(rows.some((r) => r.reviewerId === OTHER)).toBe(false);

    // Tally (the aggregate half of the reconcile view): refused.
    primeDb({ rows: [{ phase: 'independent' }] });
    await expect(getScreeningTally(ctx('owner'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
  });

  it('only after the flip to reconcile do both partner rows and the tally appear', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const rows = await getScreeningDecisions(ctx('owner'));
    expect(rows.some((r) => r.reviewerId === OTHER)).toBe(true);

    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const tally = await getScreeningTally(ctx('owner'));
    expect(tally.total).toBe(2);
  });
});

// ─── Channel 7 — ADMIN / OWNER PREVIEW ───────────────────────────────────────
// The privileged roles cannot "preview" co-reviewer work during independent, and
// an unknown/rogue role is denied by default.
describe('Channel 7 — owner / arbitrator / rogue roles get no privileged peek (independent)', () => {
  for (const { surface, getter, raw } of SURFACES) {
    for (const role of ['owner', 'arbitrator'] as const) {
      it(`${surface}: ${role} preview returns own-only, no partner`, async () => {
        primeDb({ rows: [{ phase: 'independent' }] }, { rows: raw });
        const out = await getter(ctx(role));
        expect(out.some((r) => r.reviewerId === OTHER)).toBe(false);
        expectNoPartnerData(out);
      });
    }

    it(`${surface}: a forged/unknown role is denied by default in both phases`, async () => {
      const rogue = 'admin' as unknown as ReviewRole;
      for (const phase of ['independent', 'reconcile'] as const) {
        primeDb({ rows: [{ phase }] });
        await expect(getter(ctx(rogue))).rejects.toBeInstanceOf(
          BlindedAccessError,
        );
      }
    });
  }

  it('the policy invariant holds: no role EVER resolves to "all" during independent', () => {
    for (const role of ALL_ROLES) {
      expect(resolveRowVisibility(role, 'independent')).not.toBe('all');
    }
    expect(
      resolveRowVisibility('admin' as unknown as ReviewRole, 'independent'),
    ).toBe('none');
  });
});

// ─── Channel 8 — PHASE-TRANSITION WINDOW (TOCTOU) ────────────────────────────
// The chokepoint reads phase from `reviews` FIRST, then reads rows. The decision
// and the filter both use that single captured phase value, so there is no
// window where a phase read as `independent` yields `all` rows — even if rows
// written during the flip already contain the partner's data.
describe('Channel 8 — no phase-transition window leaks a stale-phase read', () => {
  it('phase captured as independent governs the filter even if partner rows arrived', async () => {
    // Simulate the race: phase still reads independent, but the row fetch a
    // moment later already returns the partner's freshly-written rows.
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: screeningRaw });
    const out = await getScreeningDecisions(ctx('reviewer'));
    expect(out.some((r) => r.reviewerId === OTHER)).toBe(false);
    expectNoPartnerData(out);
  });

  it('phase is read before rows (order fixes the decision, not the row contents)', async () => {
    const execute = primeDb(
      { rows: [{ phase: 'independent' }] },
      { rows: screeningRaw },
    );
    await getScreeningDecisions(ctx('reviewer'));
    // First DB call is the authoritative phase lookup; the row read follows it.
    const firstSql = String(execute.mock.calls[0]?.[0] ?? '');
    expect(execute).toHaveBeenCalledTimes(2);
    // The phase query targets `reviews`, not a blinded reader.
    expect(firstSql.toLowerCase()).not.toContain('sr_read_');
  });

  it('two reviews in flight are each gated by their OWN phase (no cross-bleed)', async () => {
    // Independent review → own-only.
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: screeningRaw });
    const indep = await getScreeningDecisions(ctx('owner'));
    expect(indep.some((r) => r.reviewerId === OTHER)).toBe(false);

    // A different review already at reconcile → all rows. Phase is not inherited.
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const recon = await getScreeningDecisions({
      reviewId: 'review-2',
      requesterId: SELF,
      role: 'owner',
    });
    expect(recon.some((r) => r.reviewerId === OTHER)).toBe(true);
  });

  it('a caller cannot spoof reconcile — phase comes from reviews, not the context', async () => {
    // The BlindedContext has no phase field; the only phase source is the DB.
    // Even an owner asking during independent gets own-only.
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: screeningRaw });
    const out = await getScreeningDecisions(ctx('owner'));
    expect(out.every((r) => r.reviewerId === SELF)).toBe(true);
  });
});
