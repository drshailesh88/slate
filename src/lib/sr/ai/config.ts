// ─────────────────────────────────────────────────────────────────────────────
// AI reviewer configuration — the founder-flippable switches, in ONE place.
//
// PHASE-1 TIMING (the founder-deferred call, per the T14 brief). Both options
// are science-safe; the DEFAULT is `silent_hold`:
//   • silent_hold    — the AI runs DURING Phase 1 (`independent`) and its verdict
//                      is HELD (blinded by the chokepoint) until `reconcile`. It
//                      does not delay humans; its input is ready at reconcile.
//   • defer_to_phase2 — the AI does not run until the surface reaches `reconcile`.
// Flipping is trivial: change the default below or set SR_AI_PHASE1_MODE. Nothing
// else in the pipeline branches on the phase except `shouldAiRunDuringIndependent`.
//
// The relevance SCORE has no switch — it is never produced, never shown
// (FOUNDATION-auth-tenancy.md §8). The recall-validation TARGET has a default of
// 0.95 and is configurable per the same section.
// ─────────────────────────────────────────────────────────────────────────────

export type AiPhase1Mode = 'silent_hold' | 'defer_to_phase2';

export const DEFAULT_AI_PHASE1_MODE: AiPhase1Mode = 'silent_hold';

const AI_PHASE1_MODE_ENV = 'SR_AI_PHASE1_MODE' as const;

export function getAiPhase1Mode(): AiPhase1Mode {
  return process.env[AI_PHASE1_MODE_ENV] === 'defer_to_phase2'
    ? 'defer_to_phase2'
    : DEFAULT_AI_PHASE1_MODE;
}

// The one place the phase switch is read. During `independent` the AI runs only
// in silent_hold; during `reconcile` the AI always may run (both modes).
export function shouldAiRunDuringIndependent(mode: AiPhase1Mode): boolean {
  return mode === 'silent_hold';
}

// Default recall/sensitivity target on the includes (FOUNDATION §8: default 95%).
export const DEFAULT_RECALL_TARGET = 0.95;

// The model id the live adapter runs, as a Vercel AI Gateway "provider/model"
// string. Overridable via SR_AI_MODEL. The provider key is founder-provisioned
// (see AGENTS.md) — without it, live screening fails at call time; the mock model
// is used for build + tests.
export const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini' as const;

const AI_MODEL_ENV = 'SR_AI_MODEL' as const;

export function getConfiguredAiModelId(): string {
  const configured = process.env[AI_MODEL_ENV];
  return configured && configured.length > 0 ? configured : DEFAULT_AI_MODEL;
}
