'use server';

import { revalidatePath } from 'next/cache';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { canManageImport, type ImportTarget } from '@/lib/sr/import';
import { DrizzleImportStore } from '@/lib/sr/import-drizzle-store';
import {
  importReferences,
  markNotDuplicate,
  mergeDuplicate,
  restoreImport,
  SrImportError,
  undoDedupDecision,
  undoImport,
} from '@/lib/sr/import-service';
import { isImportFormat, parseReferences } from '@/lib/sr/import-parse';

// Server-action boundary for import + dedup (T9). Every action re-resolves live
// membership (deny-by-default, never a JWT role) and gates mutations on the
// owner/collaborator role. Results are returned so the client can render honest
// feedback; SrImportError / authz errors never leak as a stack trace.

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface ImportActionResult extends ActionResult {
  imported?: number;
  duplicates?: number;
  needsReview?: number;
  skipped?: number;
}

export interface ImportActionInput {
  reviewId: string;
  format: string;
  source: string;
  target: ImportTarget;
  text: string;
}

const FORBIDDEN =
  'Only the review owner and collaborators can import references or resolve duplicates.';

// Authorize a mutation: prove active membership AND the manage-import role.
// Returns the member context, or a typed refusal the caller surfaces verbatim.
async function authorizeManage(
  reviewId: string,
): Promise<{ ctx: MemberContext } | { error: string }> {
  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) return { error: 'Review not found.' };
    throw error;
  }
  if (!canManageImport(ctx.member.role)) return { error: FORBIDDEN };
  return { ctx };
}

function revalidate(reviewId: string): void {
  revalidatePath(`/systematic-review/${reviewId}/import`);
}

export async function runImport(
  input: ImportActionInput,
): Promise<ImportActionResult> {
  const auth = await authorizeManage(input.reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };

  if (!isImportFormat(input.format)) {
    return {
      ok: false,
      error: 'Choose a supported format (RIS, CSV, or PubMed IDs).',
    };
  }
  if (!input.text.trim()) {
    return { ok: false, error: 'Paste references or upload a file to import.' };
  }

  const { references, skipped } = parseReferences(input.format, input.text);
  if (references.length === 0) {
    return {
      ok: false,
      error:
        skipped > 0
          ? `No importable references found (${skipped} record${skipped === 1 ? '' : 's'} had no title).`
          : 'No references found in that input for the selected format.',
    };
  }

  const source = input.source.trim() || defaultSource(input.format);

  try {
    const outcome = await importReferences(new DrizzleImportStore(), {
      reviewId: input.reviewId,
      actorId: auth.ctx.userId,
      source,
      target: input.target,
      ai: false,
      references,
    });
    revalidate(input.reviewId);
    return {
      ok: true,
      imported: outcome.imported,
      duplicates: outcome.duplicates,
      needsReview: outcome.needsReview,
      skipped,
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function runMerge(
  reviewId: string,
  studyId: string,
): Promise<ActionResult> {
  return mutateStudy(reviewId, studyId, mergeDuplicate);
}

export async function runMarkNotDuplicate(
  reviewId: string,
  studyId: string,
): Promise<ActionResult> {
  return mutateStudy(reviewId, studyId, markNotDuplicate);
}

export async function runUndoDedup(
  reviewId: string,
  studyId: string,
): Promise<ActionResult> {
  return mutateStudy(reviewId, studyId, undoDedupDecision);
}

export async function runUndoImport(
  reviewId: string,
  batchId: string,
): Promise<ActionResult> {
  return mutateBatch(reviewId, batchId, undoImport);
}

export async function runRestoreImport(
  reviewId: string,
  batchId: string,
): Promise<ActionResult> {
  return mutateBatch(reviewId, batchId, restoreImport);
}

type StudyMutation = (
  store: DrizzleImportStore,
  action: { reviewId: string; actorId: string; studyId: string },
) => Promise<void>;

type BatchMutation = (
  store: DrizzleImportStore,
  action: { reviewId: string; actorId: string; batchId: string },
) => Promise<void>;

async function mutateStudy(
  reviewId: string,
  studyId: string,
  op: StudyMutation,
): Promise<ActionResult> {
  const auth = await authorizeManage(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    await op(new DrizzleImportStore(), {
      reviewId,
      actorId: auth.ctx.userId,
      studyId,
    });
    revalidate(reviewId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

async function mutateBatch(
  reviewId: string,
  batchId: string,
  op: BatchMutation,
): Promise<ActionResult> {
  const auth = await authorizeManage(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    await op(new DrizzleImportStore(), {
      reviewId,
      actorId: auth.ctx.userId,
      batchId,
    });
    revalidate(reviewId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

function defaultSource(format: string): string {
  switch (format) {
    case 'ris':
      return 'RIS import';
    case 'csv':
      return 'CSV import';
    case 'pubmed':
      return 'PubMed';
    default:
      return 'Import';
  }
}

function toMessage(error: unknown): string {
  if (error instanceof SrImportError || isSrAuthzError(error))
    return error.message;
  return 'Something went wrong. Please try again.';
}
