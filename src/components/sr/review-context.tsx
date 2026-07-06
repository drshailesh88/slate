'use client';

import { createContext, useContext } from 'react';
import type { ReviewRole, SafeProgress } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Review context — the safe, non-blinded facts about the current review, shared
// with client children (interactive stage screens) without prop-drilling.
//
// It carries ONLY data that is safe to expose to any active member: identity,
// the caller's live review role, the imported study count, and the blinding-safe
// completion progress from the chokepoint (getSafeProgress). It NEVER carries
// blinded rows, decision distributions, or conflict counts. Server components
// that need to authorize still call requireMember themselves (defense in depth);
// this context is a convenience for the client, resolved once by the layout.
// ─────────────────────────────────────────────────────────────────────────────

export interface SrReviewContextValue {
  reviewId: string;
  title: string;
  reviewType: string;
  /** The caller's LIVE review_members role (resolved server-side, never a JWT). */
  role: ReviewRole;
  /** Imported studies for this review (non-blinded). */
  studyCount: number;
  /** Blinding-safe completion counts per surface — no decision data. */
  safeProgress: SafeProgress;
}

const SrReviewContext = createContext<SrReviewContextValue | null>(null);

export function SrReviewProvider({
  value,
  children,
}: {
  value: SrReviewContextValue;
  children: React.ReactNode;
}) {
  return (
    <SrReviewContext.Provider value={value}>
      {children}
    </SrReviewContext.Provider>
  );
}

export function useSrReview(): SrReviewContextValue {
  const value = useContext(SrReviewContext);
  if (!value) {
    throw new Error(
      'useSrReview must be used within an SrReviewProvider. It is provided by the ' +
        'systematic-review/[reviewId] layout — a stage screen rendered outside that ' +
        'layout has no review context.',
    );
  }
  return value;
}
