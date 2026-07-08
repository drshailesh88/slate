'use client';

import { useState } from 'react';
import { ArrowDown, ArrowRight, ShieldAlert } from 'lucide-react';
import type { PrismaStudyRefDTO, PrismaViewDTO } from '@/lib/sr/prisma/types';
import styles from './prisma-screen.module.css';

// Screen 9 — the PRISMA 2020 flow diagram (T17), auto-generated from the
// review's real data. Every blinded-derived number arrived through the blinding
// chokepoint (getPrismaFlow) — while screening is independent the server sends
// NO flow at all (dto.flow is null) and this renders the withheld state, so a
// stage count or per-reason breakdown physically cannot leak early. Clicking
// any count opens the underlying records — every record is accounted for.

interface Drill {
  key: string;
  label: string;
  studyIds: string[];
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function CountBox({
  value,
  label,
  sub,
  included,
  drill,
  openDrill,
  onDrill,
}: {
  value: number;
  label: string;
  sub?: string;
  included?: boolean;
  drill?: Drill;
  openDrill: Drill | null;
  onDrill: (drill: Drill) => void;
}) {
  const boxClass = included ? `${styles.box} ${styles.boxInc}` : styles.box;
  const body = (
    <>
      <b className={styles.boxValue}>{formatCount(value)}</b>
      <span className={styles.boxLabel}>{label}</span>
      {sub ? <span className={styles.boxSub}>{sub}</span> : null}
    </>
  );

  if (!drill || value === 0) {
    return <div className={boxClass}>{body}</div>;
  }
  const open = openDrill?.key === drill.key;
  return (
    <button
      type="button"
      className={`${boxClass} ${styles.boxDrill}${open ? ` ${styles.boxOpen}` : ''}`}
      aria-expanded={open}
      onClick={() => onDrill(drill)}
    >
      {body}
    </button>
  );
}

function WithheldValue({ label }: { label: string }) {
  return (
    <div className={`${styles.box} ${styles.boxWithheld}`}>
      <span className={styles.withheldPill}>
        <ShieldAlert size={11} aria-hidden /> Blinded
      </span>
      <span className={styles.boxLabel}>{label}</span>
    </div>
  );
}

function DrillPanel({
  drill,
  studies,
  onClose,
}: {
  drill: Drill;
  studies: Record<string, PrismaStudyRefDTO>;
  onClose: () => void;
}) {
  return (
    <div className={styles.drillPanel} aria-live="polite">
      <div className={styles.drillHead}>
        <span className={styles.drillTitle}>
          {drill.label} ·{' '}
          <span className={styles.drillCount}>{drill.studyIds.length}</span>
        </span>
        <button type="button" className={styles.drillClose} onClick={onClose}>
          Close
        </button>
      </div>
      <ul className={styles.drillList}>
        {drill.studyIds.map((id) => {
          const study = studies[id];
          const meta = study
            ? [study.authors, study.year ? String(study.year) : null]
                .filter(Boolean)
                .join(' · ')
            : '';
          return (
            <li key={id} className={styles.drillRow}>
              <span className={styles.drillStudyTitle}>
                {study?.title ?? 'Untitled record'}
              </span>
              {meta ? <span className={styles.drillMeta}>{meta}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PrismaScreen({ dto }: { dto: PrismaViewDTO }) {
  const [openDrill, setOpenDrill] = useState<Drill | null>(null);

  const toggleDrill = (drill: Drill) =>
    setOpenDrill((prev) => (prev?.key === drill.key ? null : drill));

  const { identification, flow } = dto;
  const allIds = identification.perSource.flatMap((s) => s.studyIds);
  const duplicateIds = new Set(identification.duplicateStudyIds);
  const screenedIds = allIds.filter((id) => !duplicateIds.has(id));

  const withheld = flow === null;
  const assessedIds = flow
    ? [
        ...flow.buckets.ftExcluded,
        ...flow.buckets.included,
        ...flow.buckets.ftInProgress,
      ]
    : [];

  return (
    <div className={styles.screen}>
      <div className={styles.eyebrow}>Stage 7 · The funnel</div>
      <h1 className={styles.title}>PRISMA 2020 flow diagram</h1>
      <p className={styles.lead}>
        Auto-generated from the review&apos;s live data — every imported record
        is accounted for at every stage, and the numbers reconcile (records in =
        records out + records excluded). Click any count to see the underlying
        records. Full-text exclusions carry their recorded reasons (PRISMA Item
        16b).
      </p>

      {withheld ? (
        <div className={styles.stateBlock}>
          <div className={styles.blindPill}>
            <ShieldAlert size={11} aria-hidden /> Blinded
          </div>
          <h3 className={styles.stateTitle}>Stage counts open after unblind</h3>
          <p className={styles.stateBody}>
            While screening is independent, screening and eligibility counts are
            aggregates over every reviewer&apos;s calls, so they stay inside the
            blinding chokepoint. Identification numbers below come from the
            imported records and are always visible.
            {dto.progress
              ? ` So far ${dto.progress.finishedReviewers} of ${dto.progress.totalReviewers} reviewers have finished screening.`
              : ''}
          </p>
        </div>
      ) : null}

      <div className={styles.diagram}>
        {/* ── Identification ─────────────────────────────────────────────── */}
        <div className={styles.phase}>Identification</div>
        <div className={styles.row}>
          <div className={styles.mainCol}>
            <CountBox
              value={identification.identified}
              label="records identified"
              drill={{
                key: 'identified',
                label: 'Records identified',
                studyIds: allIds,
              }}
              openDrill={openDrill}
              onDrill={toggleDrill}
            />
            {identification.perSource.length > 0 ? (
              <div className={styles.sourceList}>
                {identification.perSource.map((entry) => (
                  <button
                    key={entry.source ?? '(none)'}
                    type="button"
                    className={styles.sourceRow}
                    aria-expanded={
                      openDrill?.key === `source:${entry.source ?? '(none)'}`
                    }
                    onClick={() =>
                      toggleDrill({
                        key: `source:${entry.source ?? '(none)'}`,
                        label: entry.source ?? 'Source not recorded',
                        studyIds: entry.studyIds,
                      })
                    }
                  >
                    <span>{entry.source ?? 'Source not recorded'}</span>
                    <span className={styles.sourceCount}>
                      {formatCount(entry.count)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.sideCol}>
            <span className={styles.sideArrow} aria-hidden>
              <ArrowRight size={14} />
            </span>
            <CountBox
              value={identification.duplicatesRemoved}
              label="duplicate records removed before screening"
              drill={{
                key: 'duplicates',
                label: 'Duplicate records removed',
                studyIds: identification.duplicateStudyIds,
              }}
              openDrill={openDrill}
              onDrill={toggleDrill}
            />
          </div>
        </div>

        <div className={styles.flowArrow} aria-hidden>
          <ArrowDown size={15} />
        </div>

        {/* ── Screening (title & abstract) ────────────────────────────────── */}
        <div className={styles.phase}>Screening</div>
        <div className={styles.row}>
          <div className={styles.mainCol}>
            <CountBox
              value={identification.screened}
              label="records screened (title & abstract)"
              drill={{
                key: 'screened',
                label: 'Records screened',
                studyIds: screenedIds,
              }}
              openDrill={openDrill}
              onDrill={toggleDrill}
            />
          </div>
          <div className={styles.sideCol}>
            <span className={styles.sideArrow} aria-hidden>
              <ArrowRight size={14} />
            </span>
            {withheld ? (
              <WithheldValue label="records excluded at title & abstract" />
            ) : (
              <>
                <CountBox
                  value={flow.screening.excluded}
                  label="records excluded at title & abstract"
                  drill={{
                    key: 'taExcluded',
                    label: 'Excluded at title & abstract',
                    studyIds: flow.buckets.taExcluded,
                  }}
                  openDrill={openDrill}
                  onDrill={toggleDrill}
                />
                {flow.screening.inProgress > 0 ? (
                  <CountBox
                    value={flow.screening.inProgress}
                    label="records awaiting a screening decision"
                    drill={{
                      key: 'taInProgress',
                      label: 'Awaiting a screening decision',
                      studyIds: flow.buckets.taInProgress,
                    }}
                    openDrill={openDrill}
                    onDrill={toggleDrill}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className={styles.flowArrow} aria-hidden>
          <ArrowDown size={15} />
        </div>

        {/* ── Eligibility (full text) ─────────────────────────────────────── */}
        <div className={styles.phase}>Eligibility</div>
        <div className={styles.row}>
          <div className={styles.mainCol}>
            {withheld ? (
              <WithheldValue label="reports assessed for eligibility (full text)" />
            ) : (
              <CountBox
                value={flow.eligibility.assessed}
                label="reports assessed for eligibility (full text)"
                drill={{
                  key: 'assessed',
                  label: 'Assessed for eligibility',
                  studyIds: assessedIds,
                }}
                openDrill={openDrill}
                onDrill={toggleDrill}
              />
            )}
          </div>
          <div className={styles.sideCol}>
            <span className={styles.sideArrow} aria-hidden>
              <ArrowRight size={14} />
            </span>
            {withheld ? (
              <WithheldValue label="reports excluded, with reasons" />
            ) : (
              <>
                <CountBox
                  value={flow.eligibility.excluded}
                  label="reports excluded, with reasons"
                  drill={{
                    key: 'ftExcluded',
                    label: 'Excluded at full text',
                    studyIds: flow.buckets.ftExcluded,
                  }}
                  openDrill={openDrill}
                  onDrill={toggleDrill}
                />
                {flow.eligibility.reasons.length > 0 ? (
                  <div className={styles.reasonList}>
                    {flow.eligibility.reasons.map((reason) => (
                      <button
                        key={reason.code ?? '(none)'}
                        type="button"
                        className={styles.reasonRow}
                        aria-expanded={
                          openDrill?.key === `reason:${reason.code ?? '(none)'}`
                        }
                        onClick={() =>
                          toggleDrill({
                            key: `reason:${reason.code ?? '(none)'}`,
                            label: `Excluded — ${reason.label}`,
                            studyIds: reason.studyIds,
                          })
                        }
                      >
                        <span>{reason.label}</span>
                        <span className={styles.reasonCount}>
                          {formatCount(reason.count)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {flow.eligibility.inProgress > 0 ? (
                  <CountBox
                    value={flow.eligibility.inProgress}
                    label="reports awaiting a full-text decision"
                    drill={{
                      key: 'ftInProgress',
                      label: 'Awaiting a full-text decision',
                      studyIds: flow.buckets.ftInProgress,
                    }}
                    openDrill={openDrill}
                    onDrill={toggleDrill}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className={styles.flowArrow} aria-hidden>
          <ArrowDown size={15} />
        </div>

        {/* ── Included ────────────────────────────────────────────────────── */}
        <div className={styles.phase}>Included</div>
        <div className={styles.row}>
          <div className={styles.mainCol}>
            {withheld ? (
              <WithheldValue label="studies included in the review" />
            ) : (
              <CountBox
                value={flow.included.studies}
                label="studies included in the review"
                sub={`${formatCount(flow.included.reports)} reports of included studies`}
                included
                drill={{
                  key: 'included',
                  label: 'Studies included',
                  studyIds: flow.buckets.included,
                }}
                openDrill={openDrill}
                onDrill={toggleDrill}
              />
            )}
          </div>
          <div className={styles.sideCol} />
        </div>
      </div>

      {openDrill ? (
        <DrillPanel
          drill={openDrill}
          studies={dto.studies}
          onClose={() => setOpenDrill(null)}
        />
      ) : null}
    </div>
  );
}
