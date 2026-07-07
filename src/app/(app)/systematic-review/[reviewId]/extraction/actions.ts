'use server';

import { revalidatePath } from 'next/cache';
import {
  finishOwnExtraction,
  saveOwnExtractionEntry,
} from '@/lib/sr/authz/extraction-write';
import {
  assertArbitratorIndependent,
  isSrAuthzError,
  requireMember,
  requireStudyInReview,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { DrizzleExtractionConsensusStore } from '@/lib/sr/extraction/drizzle-store';
import {
  ExtractionForbiddenError,
  ExtractionInvalidError,
  ExtractionWrongPhaseError,
  isExtractionError,
} from '@/lib/sr/extraction/errors';
import {
  loadExtractionFacts,
  unblindExtraction,
} from '@/lib/sr/extraction/phase';
import {
  canExtract,
  canReconcile,
  canUnblindExtraction,
} from '@/lib/sr/extraction/roles';
import {
  leaveUnresolved,
  logAuthorContact,
  resolveExtractionField,
} from '@/lib/sr/extraction/service';
import {
  isExtractionState,
  type ExtractionState,
} from '@/lib/sr/extraction/states';
import type {
  ExtractionActionResult,
  ExtractionConsensusSource,
  LeaveUnresolvedInput,
  LogAuthorContactInput,
  ProvenanceDTO,
  ResolveFieldInput,
  SaveEntryInput,
} from '@/lib/sr/extraction/types';

// ─────────────────────────────────────────────────────────────────────────────
// Extraction server actions (T15) — the trust boundary. Every action:
//   • re-resolves LIVE membership (requireMember, defense in depth) — a role is
//     never read from the client or a JWT;
//   • gates the mutation on that live role;
//   • re-reads the authoritative phase from `reviews` (never trusts the client):
//     extraction writes only during `independent`; reconciliation only during
//     `reconcile`;
//   • writes with `reviewerId = ctx.userId` ONLY (Phase 1) — a reviewer can only
//     ever write their OWN entry — and records every consensus with an explicit
//     actor id (Phase 2), so nothing auto-resolves.
// Domain refusals come back as { ok:false } for the screen; infra rejects (500).
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_NOT_FOUND = 'Review not found.';

async function resolveMember(
  reviewId: string,
): Promise<{ ctx: MemberContext } | { error: string }> {
  try {
    return { ctx: await requireMember(reviewId) };
  } catch (error) {
    if (isSrAuthzError(error)) return { error: REVIEW_NOT_FOUND };
    throw error;
  }
}

function revalidate(reviewId: string): void {
  revalidatePath(`/systematic-review/${reviewId}/extraction`);
}

function ok(): ExtractionActionResult {
  return { ok: true };
}

function fail(
  message: string,
  code = 'extraction_invalid',
): ExtractionActionResult {
  return { ok: false, message, code };
}

function toFailure(error: unknown): ExtractionActionResult {
  if (isExtractionError(error)) return fail(error.message, error.code);
  if (isSrAuthzError(error)) return fail(error.message, error.code);
  throw error;
}

// ── shared sanitizers ─────────────────────────────────────────────────────────
function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toState(value: unknown): ExtractionState {
  if (isExtractionState(value)) return value;
  throw new ExtractionInvalidError(
    'Choose one of: Reported / Not reported / N/A / Unclear.',
  );
}

function toProvenance(value: unknown): ProvenanceDTO | null {
  if (value == null || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const dto: ProvenanceDTO = {
    reportId: str(p.reportId) || null,
    page: str(p.page) || null,
    locator: str(p.locator) || null,
  };
  if (!dto.reportId && !dto.page && !dto.locator) return null;
  return dto;
}

function toSource(value: unknown): ExtractionConsensusSource {
  if (
    value === 'reviewer1' ||
    value === 'reviewer2' ||
    value === 'ai' ||
    value === 'typed'
  ) {
    return value;
  }
  throw new ExtractionInvalidError('Unknown consensus source.');
}

// Phase guard: prove the surface is in the required phase, from `reviews`.
async function requirePhase(
  reviewId: string,
  phase: 'independent' | 'reconcile',
): Promise<void> {
  const facts = await loadExtractionFacts(reviewId);
  if (!facts) throw new ExtractionInvalidError(REVIEW_NOT_FOUND);
  if (facts.phase !== phase) {
    throw new ExtractionWrongPhaseError(
      phase === 'independent'
        ? 'Extraction has been revealed for reconciliation — entries are locked.'
        : 'Reconciliation opens only after the owner reveals both reviewers’ entries.',
    );
  }
}

// ── Phase 1 — independent extraction ─────────────────────────────────────────
export interface SaveEntryActionInput extends SaveEntryInput {
  reviewId: string;
}

export async function saveEntryAction(
  input: SaveEntryActionInput,
): Promise<ExtractionActionResult> {
  try {
    const auth = await resolveMember(input.reviewId);
    if ('error' in auth) return fail(auth.error, 'review_access_denied');
    if (!canExtract(auth.ctx.member.role)) {
      throw new ExtractionForbiddenError(
        'Only reviewers and collaborators can extract on this review.',
      );
    }
    await requirePhase(input.reviewId, 'independent');

    const studyId = str(input.studyId);
    const fieldId = str(input.fieldId);
    if (!studyId || !fieldId)
      throw new ExtractionInvalidError('Missing study or field.');
    const state = toState(input.state);
    // A `reported` value must be non-blank; other states carry no value.
    const rawValue = str(input.value ?? '');
    if (state === 'reported' && rawValue.length === 0) {
      throw new ExtractionInvalidError(
        'A "reported" field needs a value — use Not reported / N/A / Unclear if the paper is silent.',
      );
    }
    const value = state === 'reported' ? rawValue : null;
    const derived = state === 'reported' && Boolean(input.derived);
    const derivedFormula = derived
      ? str(input.derivedFormula ?? '') || null
      : null;

    // IDOR kill: the study must belong to THIS review.
    await requireStudyInReview({ reviewId: input.reviewId, studyId });

    await saveOwnExtractionEntry({
      reviewId: input.reviewId,
      studyId,
      fieldId,
      // The caller's OWN id — never a client-supplied reviewerId.
      reviewerId: auth.ctx.userId,
      value,
      state,
      derived,
      derivedFormula,
      provenance: toProvenance(input.provenance),
    });

    revalidate(input.reviewId);
    return ok();
  } catch (error) {
    return toFailure(error);
  }
}

export async function finishExtractionAction(
  reviewId: string,
): Promise<ExtractionActionResult> {
  try {
    const auth = await resolveMember(reviewId);
    if ('error' in auth) return fail(auth.error, 'review_access_denied');
    if (!canExtract(auth.ctx.member.role)) {
      throw new ExtractionForbiddenError(
        'Only reviewers and collaborators can extract on this review.',
      );
    }
    await requirePhase(reviewId, 'independent');

    await finishOwnExtraction({ reviewId, reviewerId: auth.ctx.userId });
    revalidate(reviewId);
    return ok();
  } catch (error) {
    return toFailure(error);
  }
}

export async function unblindExtractionAction(
  reviewId: string,
): Promise<ExtractionActionResult & { flipped?: boolean }> {
  try {
    const auth = await resolveMember(reviewId);
    if ('error' in auth) return fail(auth.error, 'review_access_denied');
    if (!canUnblindExtraction(auth.ctx.member.role)) {
      throw new ExtractionForbiddenError(
        'Only the review owner can reveal entries for reconciliation.',
      );
    }
    const { flipped } = await unblindExtraction(reviewId, auth.ctx.userId);
    revalidate(reviewId);
    return { ok: true, flipped };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Phase 2 — reconciliation ─────────────────────────────────────────────────
async function authorizeReconcile(
  reviewId: string,
  studyId: string,
): Promise<MemberContext> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) throw new ExtractionForbiddenError(auth.error);
  if (!canReconcile(auth.ctx.member.role)) {
    throw new ExtractionForbiddenError(
      'You do not have permission to reconcile this extraction.',
    );
  }
  await requirePhase(reviewId, 'reconcile');
  await requireStudyInReview({ reviewId, studyId });
  return auth.ctx;
}

export async function resolveFieldAction(
  reviewId: string,
  input: ResolveFieldInput,
): Promise<ExtractionActionResult> {
  try {
    const studyId = str(input.studyId);
    const fieldId = str(input.fieldId);
    if (!studyId || !fieldId)
      throw new ExtractionInvalidError('Missing study or field.');

    const ctx = await authorizeReconcile(reviewId, studyId);

    // The ladder rung is DERIVED from the actor's role: an arbitrator adjudicates
    // (independence asserted server-side); anyone else records a discussion.
    const isArbitrator = ctx.member.role === 'arbitrator';
    if (isArbitrator) {
      await assertArbitratorIndependent({
        reviewId,
        studyId,
        userId: ctx.userId,
      });
    }

    const state = toState(input.state);
    await resolveExtractionField(
      new DrizzleExtractionConsensusStore(),
      {
        reviewId,
        studyId,
        fieldId,
        source: toSource(input.source),
        value: input.value ?? null,
        state,
        derived: Boolean(input.derived),
        derivedFormula: str(input.derivedFormula ?? '') || null,
        provenance: toProvenance(input.provenance),
        method: isArbitrator ? 'arbitrator' : 'discuss',
        arbitratorId: isArbitrator ? ctx.userId : null,
        actorId: ctx.userId,
      },
      new Date(),
    );

    revalidate(reviewId);
    return ok();
  } catch (error) {
    return toFailure(error);
  }
}

export async function logAuthorContactAction(
  reviewId: string,
  input: LogAuthorContactInput,
): Promise<ExtractionActionResult> {
  try {
    const studyId = str(input.studyId);
    const fieldId = str(input.fieldId);
    if (!studyId || !fieldId)
      throw new ExtractionInvalidError('Missing study or field.');

    const ctx = await authorizeReconcile(reviewId, studyId);

    await logAuthorContact(
      new DrizzleExtractionConsensusStore(),
      {
        reviewId,
        studyId,
        fieldId,
        contacted: Boolean(input.contacted),
        note: str(input.note),
        actorId: ctx.userId,
      },
      new Date(),
    );

    revalidate(reviewId);
    return ok();
  } catch (error) {
    return toFailure(error);
  }
}

export async function leaveUnresolvedAction(
  reviewId: string,
  input: LeaveUnresolvedInput,
): Promise<ExtractionActionResult> {
  try {
    const studyId = str(input.studyId);
    const fieldId = str(input.fieldId);
    if (!studyId || !fieldId)
      throw new ExtractionInvalidError('Missing study or field.');

    const ctx = await authorizeReconcile(reviewId, studyId);

    await leaveUnresolved(
      new DrizzleExtractionConsensusStore(),
      {
        reviewId,
        studyId,
        fieldId,
        authorContacted: Boolean(input.authorContacted),
        rationale: str(input.rationale),
        actorId: ctx.userId,
      },
      new Date(),
    );

    revalidate(reviewId);
    return ok();
  } catch (error) {
    return toFailure(error);
  }
}
