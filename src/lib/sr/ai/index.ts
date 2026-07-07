// Public surface of the AI screening reviewer — what the screening screen (T12),
// the members screen (T7), and the eventual calibration flow compose. Re-exports
// only; all logic lives in the sibling modules.

export type {
  AiDecision,
  AiScreeningInput,
  AiScreeningVerdict,
  ScreeningModel,
} from './types';
export {
  type AiPhase1Mode,
  DEFAULT_AI_PHASE1_MODE,
  DEFAULT_RECALL_TARGET,
  getAiPhase1Mode,
  getConfiguredAiModelId,
  shouldAiRunDuringIndependent,
} from './config';
export { requiredHumanReviewers, aiReviewerRoleForMode } from './coverage';
export {
  AiNotValidatedError,
  AiReviewerError,
  AiValidationEmptySampleError,
  AiValidationNoIncludesError,
  isAiReviewerError,
} from './errors';
export {
  computeRecallOnIncludes,
  meetsRecallTarget,
  type LabeledScreeningItem,
  type RecallResult,
} from './recall';
export {
  getLatestValidation,
  hasPassingValidation,
  runRecallValidation,
  type LabeledSampleRecord,
  type LatestValidation,
  type RecallValidationResult,
} from './validation';
export {
  ensureAiReviewerUser,
  runAiScreening,
  type AiScreeningRunResult,
  type RunAiScreeningArgs,
} from './screen-reviewer';
export {
  buildAiReviewerRail,
  type AiReviewerRailInput,
  type AiReviewerRailModel,
} from './rail';
export { createDeterministicScreeningModel } from './mock-model';
export { createVercelScreeningModel } from './vercel-model';
