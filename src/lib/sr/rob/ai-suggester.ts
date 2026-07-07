import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { studies } from '@/lib/db/schema/sr';
import { suggestAiRobJudgements } from '@/lib/sr/authz/ai-rob-write';
import { ensureAiReviewerUser } from '@/lib/sr/ai';
import {
  domainsForInstrument,
  isRobInstrument,
  type RobInstrument,
  type RobJudgement,
} from './domains';

// ─────────────────────────────────────────────────────────────────────────────
// AI Risk-of-Bias SUGGESTION orchestrator (T16, RobotReviewer-style). The AI
// appraises each domain from the study's methods text and writes a SUGGESTION —
// never a final judgement. Every safeguard lives in the orchestration around a
// narrow, pure-typed model port (mirroring the screening AI):
//
//   • BLINDED like a human: suggestions are written with the AI's own reviewer id
//     via the authz writer (ai-rob-write.ts); the chokepoint hides them from
//     humans until reconcile. No code here reads or reveals them.
//   • NEVER autonomous: it only writes is_ai suggestions — it never records a
//     consensus/final judgement; a human confirms or overrides at reconcile.
//   • COVERAGE-preserving: the AI is a SYNTHETIC user (ensureAiReviewerUser),
//     never a review_members row, so it is never a required human reviewer.
//
// This module reads only VISIBLE tables (studies) and writes exclusively through
// the authz writer.
// ─────────────────────────────────────────────────────────────────────────────

const OUT_OF_POOL_DUPE = ['auto_merged', 'merged'] as const;

// What the model is shown about one (study, domain). The methods text is the
// study's abstract — the AI appraises against the SAME evidence a human reads.
export interface RobSuggestInput {
  studyId: string;
  title: string;
  abstract: string | null;
  instrument: RobInstrument;
  domainId: string;
  domainName: string;
}

// The model's SUGGESTION for one domain. The support quote is the cited evidence
// (required — a judgement without evidence is not a suggestion a human can weigh).
export interface RobSuggestion {
  judgement: RobJudgement;
  supportQuote: string;
}

export interface RobSuggestModel {
  readonly model: string;
  readonly version: string;
  suggest(input: RobSuggestInput): Promise<RobSuggestion> | RobSuggestion;
}

// Deterministic fake RobSuggestModel — the LLM stand-in for tests and dev. It
// runs the SAME orchestration a live model would, with NO network and NO key, so
// the never-autonomous + blinding safeguards are provable offline. A real
// RobotReviewer/LLM adapter maps this same shape.
export function createDeterministicRobModel(
  opts: { model?: string; version?: string } = {},
): RobSuggestModel {
  return {
    model: opts.model ?? 'mock-rob-model',
    version: opts.version ?? 'test-1',
    suggest(input: RobSuggestInput): RobSuggestion {
      const text = `${input.title} ${input.abstract ?? ''}`.toLowerCase();
      // A cautious, honest heuristic: only claim Low when the abstract shows a
      // clear signal for the domain; otherwise Some concerns (never High from an
      // abstract alone — that needs a human read). Always human-confirmed.
      const lowSignal =
        (input.domainId === 'randomisation' &&
          /random|allocation conceal/.test(text)) ||
        (input.domainId === 'deviations' &&
          /double-blind|placebo/.test(text)) ||
        (input.domainId === 'missing' && /intention-to-treat|itt/.test(text));
      if (lowSignal) {
        return {
          judgement: 'low',
          supportQuote: `AI: the abstract signals adequate methods for "${input.domainName}" — confirm against the full text.`,
        };
      }
      return {
        judgement: 'some',
        supportQuote: `AI: the abstract does not give enough detail to rule out concerns for "${input.domainName}" — confirm against the full text.`,
      };
    },
  };
}

interface PoolStudy {
  id: string;
  title: string;
  abstract: string | null;
  instrument: RobInstrument;
}

async function loadPool(
  reviewId: string,
  studyIds?: readonly string[],
): Promise<PoolStudy[]> {
  const db = getDb();
  const filters = [
    eq(studies.reviewId, reviewId),
    notInArray(studies.dupeStatus, [...OUT_OF_POOL_DUPE]),
  ];
  if (studyIds && studyIds.length > 0) {
    filters.push(inArray(studies.id, [...studyIds]));
  }
  const rows = await db
    .select({
      id: studies.id,
      title: studies.title,
      abstract: studies.abstract,
      robInstrument: studies.robInstrument,
    })
    .from(studies)
    .where(and(...filters));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    instrument: isRobInstrument(row.robInstrument) ? row.robInstrument : 'rob2',
  }));
}

export interface RunAiRobSuggestionsArgs {
  reviewId: string;
  model: RobSuggestModel;
  /** Suggest only for these studies (still review-scoped); default the pool. */
  studyIds?: readonly string[];
  now?: Date;
}

export interface RunAiRobSuggestionsResult {
  aiReviewerId: string;
  suggested: number;
}

export async function runAiRobSuggestions(
  args: RunAiRobSuggestionsArgs,
): Promise<RunAiRobSuggestionsResult> {
  const pool = await loadPool(args.reviewId, args.studyIds);

  const rows: Array<{
    studyId: string;
    domain: string;
    judgement: RobJudgement;
    supportQuote: string;
  }> = [];

  for (const study of pool) {
    for (const domain of domainsForInstrument(study.instrument)) {
      const suggestion = await args.model.suggest({
        studyId: study.id,
        title: study.title,
        abstract: study.abstract,
        instrument: study.instrument,
        domainId: domain.id,
        domainName: domain.name,
      });
      rows.push({
        studyId: study.id,
        domain: domain.id,
        judgement: suggestion.judgement,
        supportQuote: suggestion.supportQuote,
      });
    }
  }

  const aiReviewerId = await ensureAiReviewerUser(args.reviewId);
  const { suggested } = await suggestAiRobJudgements({
    reviewId: args.reviewId,
    aiReviewerId,
    rows,
    now: args.now,
  });

  return { aiReviewerId, suggested };
}
