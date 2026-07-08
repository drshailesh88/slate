import type {
  PrismaBucketKey,
  PrismaIdentification,
} from '@/lib/sr/prisma/derive';

// The serializable view the PRISMA screen renders (T17). Assembled server-side
// by load.ts — identification is non-blinded (from `studies`); everything in
// `flow` is a blinded aggregate that ONLY exists when the chokepoint released
// it at reconcile. While screening is independent, `flow` is null and the
// screen renders the withheld state: the shape carries no field that could hold
// a stage count or per-reason breakdown early.

export interface PrismaStudyRefDTO {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
}

export interface PrismaReasonDTO {
  code: string | null;
  label: string;
  count: number;
  studyIds: string[];
}

export interface PrismaFlowDTO {
  screening: {
    screened: number;
    excluded: number;
    inProgress: number;
    advanced: number;
  };
  eligibility: {
    assessed: number;
    excluded: number;
    inProgress: number;
    reasons: PrismaReasonDTO[];
  };
  included: {
    studies: number;
    reports: number;
  };
  buckets: Record<PrismaBucketKey, string[]>;
}

export interface PrismaProgressDTO {
  finishedReviewers: number;
  totalReviewers: number;
}

export interface PrismaViewDTO {
  reviewId: string;
  state: 'independent' | 'reconcile';
  identification: PrismaIdentification;
  /** Safe completion counts — shown while the flow is withheld. */
  progress: PrismaProgressDTO | null;
  /** The reconcile-gated flow; null while screening is independent. */
  flow: PrismaFlowDTO | null;
  /** id → visible study metadata, for the drill-down record lists. */
  studies: Record<string, PrismaStudyRefDTO>;
}
