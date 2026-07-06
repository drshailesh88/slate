// ─────────────────────────────────────────────────────────────────────────────
// Import + deduplication — the PURE math (T9).
//
// Ported near-verbatim from the ScholarSync precursor `src/lib/sr/import.ts`
// (`deriveImportLedger`, `deriveDupeQueue`) and EXTENDED with the duplicate
// DETECTION the precursor lacked (it shipped pre-decided fixture statuses). The
// detection follows the Covidence model named in the precursor domain types:
// match on title · year · authors · identifiers. High-confidence pairs
// auto-merge; uncertain pairs queue for a human and stay in the pool until
// decided. Nothing here touches auth, the DB, or the network — persistence is
// rebuilt server-side (./import-service.ts) and feeds these functions.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReviewRole } from './authz/policy';

export type ImportTarget = 'screen' | 'full_text';

// Mirrors sr_dupe_status. `merged`/`kept` are the human decisions; `auto_merged`
// is the confident auto-removal; `needs_review` is the queued uncertain pair.
export type DupeStatus =
  'unique' | 'auto_merged' | 'needs_review' | 'merged' | 'kept';

export interface DupeRecord {
  status: DupeStatus;
  /** Which fields matched, e.g. ["title", "year", "first author"]. */
  matchedOn: string[];
  /** refId of the record this candidate appears to duplicate (the kept original). */
  ofRefId?: number;
}

// The view shapes the derivations consume. A thin projection of the DB rows so
// the pure functions stay DB-free and the ported precursor tests still apply.
export interface BatchView {
  id: string;
  source: string;
  target: ImportTarget;
  ai?: boolean;
}

export interface CandidateView {
  id: string;
  refId: number;
  title: string;
  authors: string[];
  year?: number;
  batchId?: string;
  dupe?: DupeRecord;
}

export interface ImportView {
  batches: BatchView[];
  candidates: CandidateView[];
}

// ── The reversible import ledger ─────────────────────────────────────────────

export interface LedgerBatch {
  id: string;
  source: string;
  target: ImportTarget;
  ai?: boolean;
  refs: number;
  duplicatesRemoved: number;
}

export interface ImportLedger {
  batches: LedgerBatch[];
  totalDuplicatesRemoved: number;
}

/** A confirmed/auto duplicate is out of the screening pool; uncertain stays in. */
export function isRemovedDuplicate(dupe: DupeRecord | undefined): boolean {
  return dupe?.status === 'auto_merged' || dupe?.status === 'merged';
}

/** The reversible import history: one card per batch, counts derived. */
export function deriveImportLedger(view: ImportView): ImportLedger {
  const batches = view.batches.map((batch) => {
    const members = view.candidates.filter(
      (candidate) => candidate.batchId === batch.id,
    );
    return {
      id: batch.id,
      source: batch.source,
      target: batch.target,
      ai: batch.ai,
      refs: members.length,
      duplicatesRemoved: members.filter((candidate) =>
        isRemovedDuplicate(candidate.dupe),
      ).length,
    };
  });

  return {
    batches,
    totalDuplicatesRemoved: batches.reduce(
      (total, batch) => total + batch.duplicatesRemoved,
      0,
    ),
  };
}

export interface DupeQueueEntry {
  candidate: CandidateView;
  matchedOn: string[];
  original?: CandidateView;
}

/** Uncertain duplicate pairs awaiting a human merge / keep decision. */
export function deriveDupeQueue(view: ImportView): DupeQueueEntry[] {
  return view.candidates
    .filter((candidate) => candidate.dupe?.status === 'needs_review')
    .map((candidate) => ({
      candidate,
      matchedOn: candidate.dupe?.matchedOn ?? [],
      original: view.candidates.find(
        (other) => other.refId === candidate.dupe?.ofRefId,
      ),
    }));
}

/** How many candidates remain in the screening pool (removed duplicates leave). */
export function countInScreeningPool(candidates: CandidateView[]): number {
  return candidates.filter((candidate) => !isRemovedDuplicate(candidate.dupe))
    .length;
}

// ── Duplicate detection (the matcher) ────────────────────────────────────────

// A reference under consideration for import. `key` is any stable id (a temp id
// for incoming rows, the study id for rows already in the pool).
export interface KeyedRef {
  key: string;
  title: string;
  authors: string[];
  year?: number | null;
  doi?: string | null;
  externalId?: string | null;
  source?: string | null;
}

export interface DupeAssignment {
  status: 'unique' | 'auto_merged' | 'needs_review';
  matchedOn: string[];
  /** `key` of the kept original this ref duplicates (absent when unique). */
  ofKey?: string;
}

const DIACRITICS = /[̀-ͯ]/g;
const NON_ALNUM = /[^a-z0-9]+/g;

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALNUM, ' ')
    .trim();
}

/** A DOI comparison key: lowercased, with any URL/`doi:` prefix stripped. */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
    .trim();
}

/** First-author comparison key: the first author string, normalized. */
export function firstAuthorKey(authors: string[]): string {
  const first = authors[0];
  if (!first) return '';
  return first
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALNUM, ' ')
    .trim();
}

function idLabel(source?: string | null): string {
  return source && /pubmed|pmid/i.test(source) ? 'pubmed id' : 'identifier';
}

// The signals shared between two references, in priority order.
function matchSignals(
  a: KeyedRef,
  b: KeyedRef,
): { strongId?: string; soft: string[] } {
  let strongId: string | undefined;

  const aDoi = a.doi ? normalizeDoi(a.doi) : '';
  const bDoi = b.doi ? normalizeDoi(b.doi) : '';
  if (aDoi && bDoi && aDoi === bDoi) strongId = 'doi';

  const aExt = a.externalId?.trim().toLowerCase() ?? '';
  const bExt = b.externalId?.trim().toLowerCase() ?? '';
  if (!strongId && aExt && bExt && aExt === bExt) {
    strongId = idLabel(a.source ?? b.source);
  }

  const soft: string[] = [];
  const aTitle = normalizeTitle(a.title);
  const bTitle = normalizeTitle(b.title);
  const titleMatch = aTitle.length > 0 && aTitle === bTitle;
  if (titleMatch) soft.push('title');

  if (a.year != null && b.year != null && a.year === b.year) soft.push('year');

  const aAuthor = firstAuthorKey(a.authors);
  const bAuthor = firstAuthorKey(b.authors);
  if (aAuthor && aAuthor === bAuthor) soft.push('first author');

  return { strongId, soft };
}

function classify(a: KeyedRef, b: KeyedRef): DupeAssignment | null {
  const { strongId, soft } = matchSignals(a, b);

  // An authoritative identifier (DOI / source id) → confident auto-merge, even
  // if titles differ (e.g. a corrected title on the same DOI).
  if (strongId) {
    return { status: 'auto_merged', matchedOn: [strongId, ...soft] };
  }

  // No shared identifier: a title match plus a corroborating field (year or
  // first author) is a probable — but not certain — duplicate → human queue.
  const titleMatch = soft.includes('title');
  const corroborated = soft.includes('year') || soft.includes('first author');
  if (titleMatch && corroborated) {
    return { status: 'needs_review', matchedOn: soft };
  }

  return null;
}

// Decide each incoming ref against the growing pool of kept originals (existing
// pool rows first, then earlier-in-batch rows). First strong match wins; a
// strong-id match beats a soft title match. Confident duplicates are removed
// (not re-used as originals); uncertain + unique rows stay in the pool so later
// rows can dedupe against them (never a silent drop of a distinct record).
export function detectDuplicates(
  incoming: KeyedRef[],
  seen: readonly KeyedRef[] = [],
): Map<string, DupeAssignment> {
  const decisions = new Map<string, DupeAssignment>();
  const pool: KeyedRef[] = [...seen];

  for (const candidate of incoming) {
    let best: DupeAssignment | null = null;
    let bestOf: string | undefined;

    for (const original of pool) {
      const verdict = classify(candidate, original);
      if (!verdict) continue;
      if (
        !best ||
        (verdict.status === 'auto_merged' && best.status !== 'auto_merged')
      ) {
        best = verdict;
        bestOf = original.key;
        if (verdict.status === 'auto_merged') break;
      }
    }

    if (best) {
      decisions.set(candidate.key, { ...best, ofKey: bestOf });
      // Uncertain pairs stay in the pool (revisable); confident ones do not.
      if (best.status === 'needs_review') pool.push(candidate);
    } else {
      decisions.set(candidate.key, { status: 'unique', matchedOn: [] });
      pool.push(candidate);
    }
  }

  return decisions;
}

// ── Authorization gate (who may mutate imports) ──────────────────────────────

// Import + dedup are setup actions: only the owner and collaborators may write.
// Reviewers, arbitrators, and viewers read the ledger but never mutate it.
export function canManageImport(role: ReviewRole): boolean {
  return role === 'owner' || role === 'collaborator';
}
