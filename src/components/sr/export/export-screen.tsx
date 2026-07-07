import {
  FileDown,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Lock,
} from 'lucide-react';
import type {
  ExportSectionSummary,
  ExportViewDTO,
} from '@/lib/sr/export/types';
import styles from './export-screen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Export (T19) — the last funnel stage: get the review's data out in the
// formats downstream tools use (RevMan / RIS / CSV / PDF). Ported from the
// ScholarSync precursor's export-screen and rebuilt on the server seam:
// downloads hit the API route, whose bundle flows through the blinding
// chokepoint — a blinded dataset shows an honest "withheld" row here, never a
// silently-empty file. The consensus dataset and the as-extracted originals
// are two separate, labeled rows: the consensus never replaces the originals.
// No interactivity → a server component; links are plain downloads.
// ─────────────────────────────────────────────────────────────────────────────

function exportHref(
  reviewId: string,
  format: 'revman' | 'ris' | 'csv' | 'pdf',
  dataset?: string,
): string {
  const base = `/api/sr/reviews/${reviewId}/export?format=${format}`;
  return dataset ? `${base}&dataset=${dataset}` : base;
}

interface DatasetRowProps {
  reviewId: string;
  dataset: string;
  name: string;
  description: string;
  summary: ExportSectionSummary;
}

function DatasetRow({
  reviewId,
  dataset,
  name,
  description,
  summary,
}: DatasetRowProps) {
  const withheld = summary.status === 'withheld';
  return (
    <li className={withheld ? styles.datasetWithheld : styles.dataset}>
      <div className={styles.datasetText}>
        <span className={styles.datasetName}>
          {withheld ? <Lock size={13} aria-hidden /> : null}
          {name}
        </span>
        <span className={styles.datasetMeta}>{description}</span>
        {withheld ? (
          <span className={styles.withheldReason}>{summary.reason}</span>
        ) : null}
      </div>
      {withheld ? (
        <span className={styles.withheldTag}>Withheld</span>
      ) : (
        <span className={styles.datasetActions}>
          <span className={styles.count}>{summary.count}</span>
          <a
            className={styles.download}
            href={exportHref(reviewId, 'csv', dataset)}
            download
          >
            CSV
          </a>
        </span>
      )}
    </li>
  );
}

export function ExportScreen({ view }: { view: ExportViewDTO }) {
  const formats = [
    {
      icon: GitMerge,
      title: 'RevMan',
      meta: 'Cochrane review file (.rm5) — references + consensus characteristics',
      href: exportHref(view.reviewId, 'revman'),
    },
    {
      icon: FileText,
      title: 'RIS',
      meta: 'References for EndNote / Zotero / Covidence',
      href: exportHref(view.reviewId, 'ris'),
    },
    {
      icon: FileSpreadsheet,
      title: 'CSV',
      meta: 'Datasets below — consensus and as-extracted stay separate files',
      href: exportHref(view.reviewId, 'csv', 'consensus'),
    },
    {
      icon: FileDown,
      title: 'PDF',
      meta: 'Human-readable record of the full export',
      href: exportHref(view.reviewId, 'pdf'),
    },
  ];

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Stage 9 · The funnel</div>
        <h1 className={styles.title}>Export</h1>
        <p className={styles.lead}>
          Consensus data and quality assessments export to the formats the field
          actually uses — statistical synthesis (meta-analysis / forest plots)
          happens in <b>RevMan or R</b>, not here. The reconciled consensus and
          each reviewer&apos;s original as-extracted entries export{' '}
          <b>separately</b>: the consensus never replaces the originals.
        </p>
      </header>

      <section aria-labelledby="export-formats">
        <h2 id="export-formats" className={styles.sectionTitle}>
          Formats
        </h2>
        <div className={styles.formatGrid}>
          {formats.map((format) => {
            const Icon = format.icon;
            return (
              <a
                key={format.title}
                className={styles.formatCard}
                href={format.href}
                download
              >
                <span className={styles.formatIcon} aria-hidden>
                  <Icon size={22} />
                </span>
                <span className={styles.formatTitle}>{format.title}</span>
                <span className={styles.formatMeta}>{format.meta}</span>
              </a>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="export-datasets">
        <h2 id="export-datasets" className={styles.sectionTitle}>
          Datasets
        </h2>
        <ul className={styles.datasetList}>
          <DatasetRow
            reviewId={view.reviewId}
            dataset="references"
            name="References"
            description="The study pool (deduplicated) — also available as RIS."
            summary={{ status: 'ready', count: view.studyCount, reason: null }}
          />
          <DatasetRow
            reviewId={view.reviewId}
            dataset="consensus"
            name="Consensus — reconciled dataset"
            description="The values a human recorded at reconciliation, with the four states, derived formulas, provenance and the resolution ladder."
            summary={{
              status: 'ready',
              count: view.consensusCount,
              reason: null,
            }}
          />
          <DatasetRow
            reviewId={view.reviewId}
            dataset="as_extracted"
            name="As-extracted — each reviewer's original entries"
            description="Every reviewer's original values, attributed and kept forever — never overwritten by the consensus."
            summary={view.asExtracted}
          />
          <DatasetRow
            reviewId={view.reviewId}
            dataset="rob"
            name="Risk of bias"
            description="Per-domain judgements with the support-for-judgement quotes."
            summary={view.rob}
          />
          <DatasetRow
            reviewId={view.reviewId}
            dataset="screening"
            name="Screening decisions"
            description="Every reviewer's calls with structured exclusion reasons."
            summary={view.screening}
          />
        </ul>
      </section>

      <div className={styles.note}>
        <b>Why no forest plot here?</b>
        <p>
          Statistical synthesis happens in RevMan or R — Slate exports cleanly
          to the tools methodologists already trust rather than inventing a
          stats engine.
        </p>
      </div>
    </div>
  );
}
