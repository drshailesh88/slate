import { emptyProtocolContent } from './constants';
import {
  AmendmentReasonRequiredError,
  ProtocolAlreadyLockedError,
  ProtocolIncompleteError,
  ProtocolLockedError,
  ProtocolNotLockedError,
} from './errors';
import type { ProtocolRow, ProtocolStore } from './store';
import type {
  ProtocolContent,
  ProtocolVersion,
  ProtocolVersionDTO,
  ProtocolView,
  ProtocolViewDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The protocol versioning state machine — pure, port-backed, clock-injected.
//
//   empty ──save──▶ draft ──save──▶ draft ──lock──▶ locked(v1)
//                                                      │
//                                        amend(reason) ▼
//                                                   locked(v2) ── … ──▶ locked(vN)
//
// Invariants this enforces:
//   • A locked protocol is NEVER overwritten — saveDraft is refused once locked.
//   • Every post-lock edit is a dated amendment: a new version with a required
//     reason, its author, and a timestamp. Silent edits are impossible.
//   • The full history (v1 baseline + every amendment) is preserved (append-only).
// ─────────────────────────────────────────────────────────────────────────────

interface Actor {
  reviewId: string;
  actorId: string;
}

type LockedRow = ProtocolRow & { version: number };

function partition(rows: ProtocolRow[]): {
  draft: ProtocolRow | null;
  versions: LockedRow[];
} {
  const draft = rows.find((r) => r.version === null) ?? null;
  const versions = rows
    .filter((r): r is LockedRow => r.version !== null)
    .sort((a, b) => a.version - b.version);
  return { draft, versions };
}

function rowToContent(row: ProtocolRow): ProtocolContent {
  return {
    researchQuestion: row.researchQuestion,
    pico: { ...row.pico },
    criteria: [...row.criteria],
  };
}

function rowToVersion(row: ProtocolRow): ProtocolVersion {
  return {
    version: row.version as number,
    content: rowToContent(row),
    reason: row.reason,
    lockedAt: row.lockedAt as Date,
    lockedBy: row.lockedBy,
  };
}

function buildView(reviewId: string, rows: ProtocolRow[]): ProtocolView {
  const { draft, versions } = partition(rows);

  if (versions.length > 0) {
    const latest = versions[versions.length - 1];
    return {
      reviewId,
      status: 'locked',
      currentVersion: latest.version as number,
      content: rowToContent(latest),
      versions: versions.map(rowToVersion),
      lockedAt: latest.lockedAt,
      lockedBy: latest.lockedBy,
    };
  }

  if (draft) {
    return {
      reviewId,
      status: 'draft',
      currentVersion: null,
      content: rowToContent(draft),
      versions: [],
      lockedAt: null,
      lockedBy: null,
    };
  }

  return {
    reviewId,
    status: 'empty',
    currentVersion: null,
    content: emptyProtocolContent(),
    versions: [],
    lockedAt: null,
    lockedBy: null,
  };
}

// A protocol with nothing to screen against cannot be locked or amended.
function assertLockable(content: ProtocolContent): void {
  if (content.criteria.length === 0) {
    throw new ProtocolIncompleteError();
  }
}

function contentSummary(content: ProtocolContent): {
  researchQuestion: string;
  pico: ProtocolContent['pico'];
  criteriaCount: number;
} {
  return {
    researchQuestion: content.researchQuestion,
    pico: content.pico,
    criteriaCount: content.criteria.length,
  };
}

export async function loadProtocol(
  store: ProtocolStore,
  reviewId: string,
): Promise<ProtocolView> {
  const rows = await store.listRows(reviewId);
  return buildView(reviewId, rows);
}

// Persist the working draft. Refused once the protocol is locked — a locked
// protocol only changes through a dated amendment, never a silent overwrite.
export async function saveDraft(
  store: ProtocolStore,
  { reviewId, actorId, content }: Actor & { content: ProtocolContent },
  now: Date,
): Promise<ProtocolView> {
  const { draft, versions } = partition(await store.listRows(reviewId));
  if (versions.length > 0) {
    throw new ProtocolLockedError();
  }

  if (draft) {
    await store.updateDraft({ reviewId, content, now });
  } else {
    await store.insertDraft({ reviewId, content, actorId, now });
  }

  await store.appendAudit({
    reviewId,
    actorId,
    action: 'protocol.save_draft',
    target: `protocol:${reviewId}`,
    before: draft ? contentSummary(rowToContent(draft)) : null,
    after: contentSummary(content),
  });

  return loadProtocol(store, reviewId);
}

// Lock the protocol: stamp the current content as immutable version 1. Refused
// if it is already locked.
export async function lockProtocol(
  store: ProtocolStore,
  { reviewId, actorId, content }: Actor & { content: ProtocolContent },
  now: Date,
): Promise<ProtocolView> {
  const { draft, versions } = partition(await store.listRows(reviewId));
  if (versions.length > 0) {
    throw new ProtocolAlreadyLockedError();
  }
  assertLockable(content);

  const stamp = { version: 1, lockedAt: now, lockedBy: actorId };
  if (draft) {
    await store.promoteDraft({ reviewId, content, stamp });
  } else {
    await store.insertVersion({
      reviewId,
      content,
      stamp,
      reason: null,
      actorId,
    });
  }

  await store.appendAudit({
    reviewId,
    actorId,
    action: 'protocol.lock',
    target: `protocol:${reviewId}:v1`,
    before: draft ? contentSummary(rowToContent(draft)) : null,
    after: { version: 1, ...contentSummary(content) },
  });

  return loadProtocol(store, reviewId);
}

// Amend a locked protocol: append a new immutable version carrying the edited
// content, the required reason, its author, and a timestamp. Never overwrites.
export async function amendProtocol(
  store: ProtocolStore,
  {
    reviewId,
    actorId,
    content,
    reason,
  }: Actor & { content: ProtocolContent; reason: string },
  now: Date,
): Promise<ProtocolView> {
  const { versions } = partition(await store.listRows(reviewId));
  if (versions.length === 0) {
    throw new ProtocolNotLockedError();
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new AmendmentReasonRequiredError();
  }
  assertLockable(content);

  const nextVersion = versions[versions.length - 1].version + 1;
  const stamp = { version: nextVersion, lockedAt: now, lockedBy: actorId };
  await store.insertVersion({
    reviewId,
    content,
    stamp,
    reason: trimmedReason,
    actorId,
  });

  await store.appendAudit({
    reviewId,
    actorId,
    action: 'protocol.amend',
    target: `protocol:${reviewId}:v${nextVersion}`,
    before: {
      version: nextVersion - 1,
      ...contentSummary(rowToContent(versions[versions.length - 1])),
    },
    after: {
      version: nextVersion,
      reason: trimmedReason,
      ...contentSummary(content),
    },
  });

  return loadProtocol(store, reviewId);
}

// ── Serialization for the RSC → client boundary ──────────────────────────────

function versionToDTO(version: ProtocolVersion): ProtocolVersionDTO {
  return {
    version: version.version,
    content: version.content,
    reason: version.reason,
    lockedAt: version.lockedAt.toISOString(),
    lockedBy: version.lockedBy,
  };
}

export function toDTO(view: ProtocolView): ProtocolViewDTO {
  return {
    reviewId: view.reviewId,
    status: view.status,
    currentVersion: view.currentVersion,
    content: view.content,
    versions: view.versions.map(versionToDTO),
    lockedAt: view.lockedAt ? view.lockedAt.toISOString() : null,
    lockedBy: view.lockedBy,
  };
}
