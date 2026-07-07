// DTOs for the Conflicts screen (T13). The server component enriches the
// chokepoint's blinded-safe conflict data (available ONLY at reconcile) with
// visible study + member metadata, serializes it here, and hands it to the
// client screen. During `independent` (or for a viewer) the chokepoint withholds
// the data and the view is `state: 'withheld'` carrying NO conflict rows or κ.

export type ResolutionMethod = 'align_on_one' | 'send_to_arbitrator';

// A picked screening call. `align_on_one` records one of these; sending to an
// arbitrator records no decision (the arbitrator decides later).
export type AlignDecision = 'include' | 'exclude';

export interface ConflictDecisionDTO {
  reviewerId: string;
  reviewerName: string | null;
  decision: string;
  isAi: boolean;
  excludeReasonDetail: string | null;
}

export interface ConflictResolutionDTO {
  studyId: string;
  method: ResolutionMethod;
  decision: string | null;
  arbitratorId: string | null;
  arbitratorName: string | null;
  note: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string;
}

export interface ConflictItemDTO {
  studyId: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  // Every opposing call, equal weight, ordered deterministically.
  decisions: ConflictDecisionDTO[];
  // Present once a human has adjudicated it; null while still open.
  resolution: ConflictResolutionDTO | null;
}

export interface EligibleArbitratorDTO {
  userId: string;
  name: string | null;
}

export interface ConflictsViewDTO {
  reviewId: string;
  stage: string;
  // 'reconcile' → conflicts revealed; 'withheld' → still blinded / not permitted.
  state: 'reconcile' | 'withheld';
  kappa: { value: number | null; label: string };
  conflicts: ConflictItemDTO[];
  eligibleArbitrators: EligibleArbitratorDTO[];
  canResolve: boolean;
}

// The untrusted payload a resolve action receives from the client.
export interface ResolveConflictInput {
  studyId: string;
  method: ResolutionMethod;
  decision?: AlignDecision;
  arbitratorId?: string;
  note?: string;
}

export type ConflictActionResult =
  { ok: true } | { ok: false; message: string; code: string };
