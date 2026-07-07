import type { screeningDecisionEnum } from '@/lib/db/schema/sr-enums';

// ─────────────────────────────────────────────────────────────────────────────
// AI screening reviewer — the port (interface) every LLM implementation honors.
//
// The safeguards (FOUNDATION-auth-tenancy.md §8–9) live in the ORCHESTRATION
// around this port, never inside a model. Keeping the LLM behind a narrow,
// pure-typed boundary means:
//   • the validation gate + screening logic are provable with a deterministic
//     fake (no network, no key) — mock-model.ts;
//   • the live Vercel AI SDK adapter (vercel-model.ts) is the ONLY file that
//     touches the SDK, and it maps this same shape.
//
// SCORE IS NEVER PART OF THIS CONTRACT. A relevance/confidence score is not
// requested from the model and has no field here — it cannot leak because it is
// never produced (FOUNDATION §8: "AI relevance score is never shown").
// ─────────────────────────────────────────────────────────────────────────────

// The AI screens to the same three-way call a human casts. It NEVER removes a
// record: an `exclude` verdict is a blinded vote that a human reconciles, not an
// exclusion (FOUNDATION §8 — "no autonomous exclusion").
export type AiDecision = (typeof screeningDecisionEnum.enumValues)[number];

// What the model is shown about one record. The eligibility criteria are the
// protocol's — the AI screens against the SAME rules a human does.
export interface AiScreeningInput {
  studyId: string;
  title: string;
  abstract: string | null;
  authors?: string | null;
  journal?: string | null;
  year?: number | null;
  /** The review's research question (protocol) — the screening frame. */
  researchQuestion: string;
  /** Inclusion/exclusion criteria lines the model screens against. */
  criteria: readonly string[];
}

// The model's verdict for one record. Reasoning is a short human-readable
// justification (revealed only at reconcile, like a human's exclude reason).
// There is deliberately NO score field.
export interface AiScreeningVerdict {
  decision: AiDecision;
  reasoning: string;
}

// The injected LLM. `model`/`version` identify what ran, for the immutable
// `ai_validations` audit row (FOUNDATION §8). `screen` is the only call.
export interface ScreeningModel {
  readonly model: string;
  readonly version: string;
  screen(input: AiScreeningInput): Promise<AiScreeningVerdict>;
}
