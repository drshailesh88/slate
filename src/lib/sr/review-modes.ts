import { reviewModeEnum, reviewRoleEnum } from '@/lib/db/schema/sr-enums';

// ─────────────────────────────────────────────────────────────────────────────
// Create-review copy + option model (pure — safe to import from a client
// component). The science-critical rule: the two review modes are described
// FACTUALLY. No mode is framed as more/less rigorous, and `ai_co_reviewer`
// never carries a scold — it gets ONE informational line stating that the AI is
// recall-validated and blinded like any human reviewer. Both modes keep the AI
// safeguarded (blinded during independent work). See SCREEN-SPECS §1.
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewMode = (typeof reviewModeEnum.enumValues)[number];
export type ReviewRole = (typeof reviewRoleEnum.enumValues)[number];

// Curated review types (stored as the label string in reviews.reviewType).
export const REVIEW_TYPES = [
  'Intervention review',
  'Diagnostic test accuracy review',
  'Prognosis review',
  'Qualitative evidence synthesis',
  'Scoping review',
  'Overview of reviews',
  'Methodology review',
] as const;

export type ReviewType = (typeof REVIEW_TYPES)[number];

export interface ReviewModeOption {
  value: ReviewMode;
  label: string;
  // A neutral statement of who does the work — never a comparison of rigor.
  description: string;
}

export const REVIEW_MODES: readonly ReviewModeOption[] = [
  {
    value: 'two_reviewer',
    label: 'Two human reviewers',
    description:
      'Two people screen and extract independently, then reconcile their decisions.',
  },
  {
    value: 'ai_co_reviewer',
    label: 'Human + AI co-reviewer',
    description:
      'A human reviewer and an AI reviewer each work independently, then reconcile together.',
  },
];

// The single informational line shown when `ai_co_reviewer` is chosen. States a
// fact about the AI safeguard — not a warning, not a comparison.
export const AI_CO_REVIEWER_NOTE =
  'The AI reviewer is recall-validated on your includes and stays blinded during independent screening — reconciled like any human reviewer.';

// Blind Mode is locked ON — the science requires independent, blinded work, so
// this is stated as a fact, never offered as a toggle the user can turn off.
export const BLIND_MODE_LABEL = 'Blind Mode';
export const BLIND_MODE_NOTE =
  'On — reviewers screen independently; this protects the review.';

export interface ReviewRoleOption {
  value: ReviewRole;
  label: string;
  description: string;
}

// Every per-review role, one factual line each (SCREEN-SPECS §1 copy).
export const REVIEW_ROLES: readonly ReviewRoleOption[] = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full control of the review and its team.',
  },
  {
    value: 'collaborator',
    label: 'Collaborator',
    description: 'Co-manages the review and its team.',
  },
  {
    value: 'reviewer',
    label: 'Reviewer',
    description: 'Screens and extracts studies independently.',
  },
  {
    value: 'arbitrator',
    label: 'Arbitrator',
    description: 'Resolves conflicts; kept independent of the two reviewers.',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to progress and results.',
  },
];

// The creator becomes the owner, so a teammate is invited as anything BUT owner.
export const INVITABLE_ROLES: readonly ReviewRoleOption[] = REVIEW_ROLES.filter(
  (role) => role.value !== 'owner',
);

export function isReviewMode(value: unknown): value is ReviewMode {
  return (
    typeof value === 'string' &&
    (reviewModeEnum.enumValues as readonly string[]).includes(value)
  );
}

export function isInvitableRole(value: unknown): value is ReviewRole {
  return INVITABLE_ROLES.some((role) => role.value === value);
}

export function isReviewType(value: unknown): value is ReviewType {
  return (
    typeof value === 'string' &&
    (REVIEW_TYPES as readonly string[]).includes(value)
  );
}
