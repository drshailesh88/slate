import type { SourceStatus } from '@/types/search';

/**
 * User-facing academic databases (label map). Add a key here when a new real
 * source is exposed; anything not here (and not an in-house `medcpt*` lane)
 * is internal engine mechanics (e.g. `pubmed_pmra`, HyDE re-query lanes) and
 * must NOT be shown to clinicians as a "source" — see the 6s fan-out
 * deadline note on `displaySources` for why those lanes exist and why they
 * are noisy.
 */
const SOURCE_LABELS: Record<string, string> = {
  pubmed: 'PubMed',
  europepmc: 'Europe PMC',
  scopus: 'Scopus',
  springer: 'Springer',
  semantic_scholar: 'Semantic Scholar',
  crossref: 'Crossref',
  arxiv: 'arXiv',
  clinical_trials: 'ClinicalTrials.gov',
  unpaywall: 'Unpaywall',
};

const MEDCPT_ID = 'medcpt';
const MEDCPT_LABEL = 'In-house index';
const MEDCPT_PREFIX = /^medcpt/;

export interface DisplaySource {
  /** A `SOURCE_LABELS` key, or `'medcpt'` for the collapsed in-house bucket. */
  id: string;
  label: string;
  ok: boolean;
}

function isOk(status: SourceStatus | undefined): boolean {
  return (status?.status ?? 'ok') === 'ok';
}

/**
 * Groups raw engine lane keys (`sourceCounts`/`sourceStatuses`) into the
 * user-facing sources a clinician actually recognizes. The engine runs
 * several internal retrieval lanes per query (HyDE re-query variants,
 * recency/recovery passes, a PMRA similarity lane) that routinely time out
 * against the 6s fan-out deadline even on a fully healthy search — those
 * lanes are mechanics, not databases, and must never surface as a degraded
 * "source" or inflate the source count.
 *
 * Rules:
 * - A key in `SOURCE_LABELS` is its own source; `ok` follows its status
 *   (absent status, or status "ok", counts as ok).
 * - Any key matching `/^medcpt/` collapses into a single `medcpt` source
 *   labeled "In-house index": `ok` is true if ANY medcpt lane is ok
 *   (including one with no reported status), false only if every medcpt
 *   lane present has a non-"ok" status.
 * - Any other key (`pubmed_pmra`, `web`, or an unrecognized internal lane)
 *   is excluded entirely — it is never counted or shown.
 */
export function displaySources(
  sourceCounts?: Record<string, number>,
  sourceStatuses?: Record<string, SourceStatus>,
): DisplaySource[] {
  const keys = new Set([
    ...Object.keys(sourceCounts ?? {}),
    ...Object.keys(sourceStatuses ?? {}),
  ]);

  const knownOk = new Map<string, boolean>();
  let medcptSeen = false;
  let medcptOk = false;

  for (const key of keys) {
    if (key in SOURCE_LABELS) {
      knownOk.set(key, isOk(sourceStatuses?.[key]));
      continue;
    }
    if (MEDCPT_PREFIX.test(key)) {
      medcptSeen = true;
      if (isOk(sourceStatuses?.[key])) medcptOk = true;
      continue;
    }
    // Internal engine lane with no user-facing meaning — excluded.
  }

  const sources: DisplaySource[] = [];
  for (const key of Object.keys(SOURCE_LABELS)) {
    if (knownOk.has(key)) {
      sources.push({
        id: key,
        label: SOURCE_LABELS[key],
        ok: knownOk.get(key)!,
      });
    }
  }
  if (medcptSeen) {
    sources.push({ id: MEDCPT_ID, label: MEDCPT_LABEL, ok: medcptOk });
  }

  return sources;
}
