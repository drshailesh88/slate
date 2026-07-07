import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { aiValidations } from '@/lib/db/schema/sr';
import { DEFAULT_RECALL_TARGET } from './config';
import {
  AiValidationEmptySampleError,
  AiValidationNoIncludesError,
} from './errors';
import { computeRecallOnIncludes, meetsRecallTarget } from './recall';
import type { AiDecision, AiScreeningInput, ScreeningModel } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// THE RECALL-VALIDATION GATE (FOUNDATION-auth-tenancy.md §8).
//
// Before the AI may screen a review it must be recall-validated on the includes:
// run the model over a HUMAN-LABELLED sample from this review, measure recall on
// the includes (recall.ts), and record the outcome in `ai_validations` (model,
// version, prompt, recall, sample size, pass). Only a `passed = true` row lets
// the AI cast decisions (enforced in screen-reviewer.ts + the members service).
//
// `ai_validations` is a VISIBLE support table (not blinded), so this module reads
// and writes it directly — it never touches the three blinded base tables.
// ─────────────────────────────────────────────────────────────────────────────

export interface LabeledSampleRecord {
  /** What the model screens — the same shape a live record is screened as. */
  input: AiScreeningInput;
  /** The human GOLD label for this record. */
  humanLabel: AiDecision;
}

export interface RecallValidationResult {
  validationId: string;
  passed: boolean;
  recall: number;
  target: number;
  sampleSize: number;
  includeCount: number;
  model: string;
  version: string;
}

const DEFAULT_VALIDATION_PROMPT =
  'Screen each record for eligibility against the review protocol (PICO + inclusion/exclusion criteria); decide include, exclude, or maybe. Recall/sensitivity on the human-labelled includes is measured; the relevance score is never surfaced.';

export interface RunRecallValidationArgs {
  reviewId: string;
  model: ScreeningModel;
  sample: readonly LabeledSampleRecord[];
  target?: number;
  prompt?: string;
}

export async function runRecallValidation(
  args: RunRecallValidationArgs,
): Promise<RecallValidationResult> {
  if (args.sample.length === 0) {
    throw new AiValidationEmptySampleError();
  }

  const target = args.target ?? DEFAULT_RECALL_TARGET;

  // Run the model over the labelled sample (mock in tests/dev; live behind the
  // founder key). Sequential keeps it deterministic and rate-limit friendly.
  const labeled = [];
  for (const record of args.sample) {
    const verdict = await args.model.screen(record.input);
    labeled.push({
      humanLabel: record.humanLabel,
      aiVerdict: verdict.decision,
    });
  }

  const recallResult = computeRecallOnIncludes(labeled);
  if (recallResult.recall === null) {
    // No human includes → recall on includes is undefined and can never pass.
    throw new AiValidationNoIncludesError();
  }

  const passed = meetsRecallTarget(recallResult.recall, target);

  const db = getDb();
  const [row] = await db
    .insert(aiValidations)
    .values({
      reviewId: args.reviewId,
      model: args.model.model,
      version: args.model.version,
      prompt: args.prompt ?? DEFAULT_VALIDATION_PROMPT,
      recallOnIncludes: recallResult.recall,
      sampleSize: recallResult.sampleSize,
      passed,
    })
    .returning({ id: aiValidations.id });

  return {
    validationId: row.id,
    passed,
    recall: recallResult.recall,
    target,
    sampleSize: recallResult.sampleSize,
    includeCount: recallResult.includeCount,
    model: args.model.model,
    version: args.model.version,
  };
}

// The gate read: is there a passing recall validation for this review? Used by
// the AI screening orchestrator and the members Activate action. Visible table.
export async function hasPassingValidation(reviewId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: aiValidations.id })
    .from(aiValidations)
    .where(
      and(eq(aiValidations.reviewId, reviewId), eq(aiValidations.passed, true)),
    )
    .limit(1);
  return Boolean(row);
}

export interface LatestValidation {
  model: string;
  version: string;
  recallOnIncludes: number;
  sampleSize: number;
  passed: boolean;
  createdAt: Date;
}

// The most recent validation (any outcome) — for the Team screen AI row.
export async function getLatestValidation(
  reviewId: string,
): Promise<LatestValidation | null> {
  const db = getDb();
  const [row] = await db
    .select({
      model: aiValidations.model,
      version: aiValidations.version,
      recallOnIncludes: aiValidations.recallOnIncludes,
      sampleSize: aiValidations.sampleSize,
      passed: aiValidations.passed,
      createdAt: aiValidations.createdAt,
    })
    .from(aiValidations)
    .where(eq(aiValidations.reviewId, reviewId))
    .orderBy(desc(aiValidations.createdAt))
    .limit(1);
  return row ?? null;
}
