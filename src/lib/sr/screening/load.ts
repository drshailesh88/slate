import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { studies } from '@/lib/db/schema/sr';
import { getSafeProgress } from '@/lib/sr/authz/blinded-read';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import { loadProtocol } from '@/lib/sr/protocol/service';
import { DrizzleProtocolStore } from '@/lib/sr/protocol/drizzle-store';
import { deriveCriteria, deriveHighlightTerms } from './criteria';
import {
  getOwnScreeningDecisions,
  hasFinishedScreening,
} from './own-decisions';
import { loadScreeningFacts } from './phase';
import {
  canCastScreeningDecision,
  canReadOwnDecisions,
  canUnblindScreening,
} from './roles';
import { stageLabel } from './stage';
import type { ScreeningStudyDTO, ScreeningViewDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The screening data SEAM — assembles the ScreeningViewDTO the client renders.
// It reads:
//   • the authoritative phase/stage from `reviews` (server-side, never client);
//   • the non-blinded study pool from `studies` (removed duplicates excluded);
//   • the caller's OWN decisions through the blinding chokepoint (never a blinded
//     table, and re-filtered to own — see own-decisions.ts);
//   • the criteria/highlight terms from the locked protocol;
//   • blinding-safe completion counts from the chokepoint (getSafeProgress).
//
// During `reconcile` it deliberately loads NO decisions — screening is over, and
// reconciliation lives on its own screen. The DTO shape cannot carry a
// co-reviewer vote or an AI verdict/score, so the screen cannot render one.
// ─────────────────────────────────────────────────────────────────────────────

// Duplicates the importer confidently removed are out of the screening pool;
// `needs_review` / `kept` / `unique` stay in.
const REMOVED_DUPE_STATUSES = ['auto_merged', 'merged'] as const;

export async function loadScreenableStudies(
  reviewId: string,
): Promise<ScreeningStudyDTO[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: studies.id,
      title: studies.title,
      abstract: studies.abstract,
      authors: studies.authors,
      journal: studies.journal,
      year: studies.year,
      doi: studies.doi,
      externalId: studies.externalId,
    })
    .from(studies)
    .where(
      and(
        eq(studies.reviewId, reviewId),
        notInArray(studies.dupeStatus, [...REMOVED_DUPE_STATUSES]),
      ),
    )
    .orderBy(studies.createdAt);

  return rows.map((row, index) => ({
    id: row.id,
    refId: row.externalId ?? `#${index + 1}`,
    title: row.title,
    authors: row.authors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    abstract: row.abstract,
  }));
}

export async function buildScreeningView(
  ctx: MemberContext,
  reviewId: string,
): Promise<ScreeningViewDTO | null> {
  const facts = await loadScreeningFacts(reviewId);
  if (!facts) return null;

  const role = ctx.member.role;

  const protocolView = await loadProtocol(new DrizzleProtocolStore(), reviewId);
  const protocolContent =
    protocolView.status === 'empty' ? null : protocolView.content;

  const progress = (await getSafeProgress(reviewId)).screening;

  const base = {
    reviewId,
    reviewTitle: facts.title,
    reviewType: facts.reviewType,
    stage: facts.stage,
    stageLabel: stageLabel(facts.stage),
    canScreen: canCastScreeningDecision(role),
    canUnblind: canUnblindScreening(role),
    criteria: deriveCriteria(protocolContent),
    highlightTerms: deriveHighlightTerms(protocolContent),
    aiRanking: null,
    progress,
  };

  if (facts.phase === 'reconcile') {
    return {
      ...base,
      phase: 'reconcile',
      finished: false,
      studies: [],
      decisions: [],
    };
  }

  const pool = await loadScreenableStudies(reviewId);
  const decisions = canReadOwnDecisions(role)
    ? await getOwnScreeningDecisions(
        { reviewId, requesterId: ctx.userId, role },
        facts.stage,
      )
    : [];

  return {
    ...base,
    phase: 'independent',
    finished: hasFinishedScreening(decisions),
    studies: pool,
    decisions,
  };
}
