import { describe, expect, it } from 'vitest';
import {
  canManageImport,
  countInScreeningPool,
  deriveDupeQueue,
  deriveImportLedger,
  detectDuplicates,
  firstAuthorKey,
  normalizeDoi,
  normalizeTitle,
  type CandidateView,
  type ImportView,
  type KeyedRef,
} from './import';

// ─────────────────────────────────────────────────────────────────────────────
// Regression port of the ScholarSync precursor `import.test.ts`
// (deriveImportLedger / deriveDupeQueue) over a focused, deterministic fixture,
// plus new coverage for the duplicate DETECTION the precursor lacked.
// ─────────────────────────────────────────────────────────────────────────────

function candidate(
  over: Partial<CandidateView> & { refId: number },
): CandidateView {
  return {
    id: `c${over.refId}`,
    title: `Study ${over.refId}`,
    authors: ['Doe J'],
    ...over,
  };
}

function fixture(): ImportView {
  return {
    batches: [
      { id: 'batch-pubmed', source: 'PubMed', target: 'screen' },
      { id: 'batch-embase', source: 'Embase, +2', target: 'screen' },
      { id: 'batch-ai', source: 'AI search', target: 'screen', ai: true },
    ],
    candidates: [
      // PubMed: 5 refs, 2 auto-merged.
      candidate({ refId: 100, batchId: 'batch-pubmed' }),
      candidate({ refId: 101, batchId: 'batch-pubmed' }),
      candidate({
        refId: 102,
        batchId: 'batch-pubmed',
        dupe: { status: 'auto_merged', matchedOn: ['doi'], ofRefId: 100 },
      }),
      candidate({
        refId: 103,
        batchId: 'batch-pubmed',
        dupe: { status: 'auto_merged', matchedOn: ['doi'], ofRefId: 101 },
      }),
      candidate({
        refId: 104,
        batchId: 'batch-pubmed',
        dupe: { status: 'kept', matchedOn: [] },
      }),
      // Embase: 4 refs, 1 human-merged + 1 uncertain (queued, still in pool).
      candidate({ refId: 200, batchId: 'batch-embase' }),
      candidate({
        refId: 201,
        batchId: 'batch-embase',
        dupe: { status: 'merged', matchedOn: ['title', 'year'], ofRefId: 200 },
      }),
      candidate({
        refId: 1665,
        batchId: 'batch-embase',
        title: 'DAPA-HF: dapagliflozin in heart failure',
        authors: ['McMurray J'],
        year: 2019,
        dupe: {
          status: 'needs_review',
          matchedOn: ['title', 'year', 'first author'],
          ofRefId: 1660,
        },
      }),
      candidate({
        refId: 1660,
        batchId: 'batch-embase',
        title: 'DAPA-HF dapagliflozin in patients with heart failure',
        authors: ['McMurray J'],
        year: 2019,
      }),
      // AI: 3 refs, 1 auto-merged.
      candidate({ refId: 300, batchId: 'batch-ai' }),
      candidate({ refId: 301, batchId: 'batch-ai' }),
      candidate({
        refId: 302,
        batchId: 'batch-ai',
        dupe: { status: 'auto_merged', matchedOn: ['pubmed id'], ofRefId: 300 },
      }),
    ],
  };
}

describe('deriveImportLedger', () => {
  const ledger = deriveImportLedger(fixture());

  it('shows one reversible card per import batch with refs and duplicates', () => {
    expect(ledger.batches).toEqual([
      {
        id: 'batch-pubmed',
        source: 'PubMed',
        target: 'screen',
        ai: undefined,
        refs: 5,
        duplicatesRemoved: 2,
      },
      {
        id: 'batch-embase',
        source: 'Embase, +2',
        target: 'screen',
        ai: undefined,
        refs: 4,
        duplicatesRemoved: 1,
      },
      {
        id: 'batch-ai',
        source: 'AI search',
        target: 'screen',
        ai: true,
        refs: 3,
        duplicatesRemoved: 1,
      },
    ]);
  });

  it('totals the duplicates removed across batches (uncertain not counted)', () => {
    expect(ledger.totalDuplicatesRemoved).toBe(4);
  });
});

describe('deriveDupeQueue', () => {
  const queue = deriveDupeQueue(fixture());

  it('queues only uncertain pairs, with what matched and the original', () => {
    expect(queue).toHaveLength(1);
    const dapa = queue.find((entry) => entry.candidate.title.includes('DAPA'));
    expect(dapa?.matchedOn).toEqual(['title', 'year', 'first author']);
    expect(dapa?.original?.refId).toBe(1660);
    expect(dapa?.original?.title).toContain('DAPA-HF');
  });

  it('keeps uncertain pairs inside the screening pool until merged', () => {
    // 12 imported − 4 removed (2 auto + 1 merged + 1 auto); the uncertain stays.
    expect(countInScreeningPool(fixture().candidates)).toBe(8);
  });
});

describe('detectDuplicates', () => {
  const base: KeyedRef = {
    key: 'orig',
    title: 'Effect of SGLT2 inhibitors on heart failure outcomes',
    authors: ['Smith A'],
    year: 2020,
    doi: '10.1000/abc',
    externalId: 'PMID:111',
    source: 'PubMed',
  };

  it('auto-merges an exact DOI match even when the title was corrected', () => {
    const decisions = detectDuplicates(
      [
        {
          ...base,
          key: 'dup',
          title: 'SGLT2 inhibitors — corrected title',
          externalId: null,
        },
      ],
      [base],
    );
    expect(decisions.get('dup')).toMatchObject({
      status: 'auto_merged',
      ofKey: 'orig',
    });
    expect(decisions.get('dup')?.matchedOn).toContain('doi');
  });

  it('auto-merges a shared PubMed identifier (labelled)', () => {
    const decisions = detectDuplicates(
      [
        {
          key: 'dup',
          title: 'Totally different title',
          authors: ['Zeta Z'],
          year: 1999,
          externalId: 'PMID:111',
          source: 'PubMed',
        },
      ],
      [base],
    );
    expect(decisions.get('dup')).toMatchObject({
      status: 'auto_merged',
      ofKey: 'orig',
    });
    expect(decisions.get('dup')?.matchedOn).toEqual(['pubmed id']);
  });

  it('queues a title+year match with no shared identifier for human review', () => {
    const decisions = detectDuplicates(
      [{ key: 'dup', title: base.title, authors: ['Other O'], year: 2020 }],
      [base],
    );
    expect(decisions.get('dup')).toMatchObject({
      status: 'needs_review',
      ofKey: 'orig',
    });
    expect(decisions.get('dup')?.matchedOn).toEqual(['title', 'year']);
  });

  it('records title+year+first author when all three corroborate', () => {
    const decisions = detectDuplicates(
      [{ key: 'dup', title: base.title, authors: ['Smith A'], year: 2020 }],
      [base],
    );
    expect(decisions.get('dup')?.matchedOn).toEqual([
      'title',
      'year',
      'first author',
    ]);
  });

  it('leaves a title-only near-match unique (not enough to flag)', () => {
    const decisions = detectDuplicates(
      [{ key: 'dup', title: base.title, authors: ['Other O'], year: 1980 }],
      [base],
    );
    expect(decisions.get('dup')?.status).toBe('unique');
  });

  it('never silently drops distinct records', () => {
    const refs: KeyedRef[] = [
      { key: 'a', title: 'Alpha study', authors: ['A'], year: 2001 },
      { key: 'b', title: 'Beta study', authors: ['B'], year: 2002 },
      { key: 'c', title: 'Gamma study', authors: ['C'], year: 2003 },
    ];
    const decisions = detectDuplicates(refs);
    expect(decisions.size).toBe(3);
    expect([...decisions.values()].every((d) => d.status === 'unique')).toBe(
      true,
    );
  });

  it('dedupes later rows against earlier rows in the same import', () => {
    const refs: KeyedRef[] = [
      {
        key: 'a',
        title: 'Same paper',
        authors: ['A'],
        year: 2020,
        doi: '10.1/x',
      },
      {
        key: 'b',
        title: 'Same paper',
        authors: ['A'],
        year: 2020,
        doi: '10.1/x',
      },
      {
        key: 'c',
        title: 'Same paper',
        authors: ['A'],
        year: 2020,
        doi: '10.1/x',
      },
    ];
    const decisions = detectDuplicates(refs);
    expect(decisions.get('a')?.status).toBe('unique');
    expect(decisions.get('b')).toMatchObject({
      status: 'auto_merged',
      ofKey: 'a',
    });
    expect(decisions.get('c')).toMatchObject({
      status: 'auto_merged',
      ofKey: 'a',
    });
  });
});

describe('normalization helpers', () => {
  it('normalizes titles (case, punctuation, diacritics, whitespace)', () => {
    expect(normalizeTitle('  Effëct: of  SGLT2!! ')).toBe('effect of sglt2');
  });

  it('strips doi.org / doi: prefixes', () => {
    expect(normalizeDoi('https://doi.org/10.1000/ABC')).toBe('10.1000/abc');
    expect(normalizeDoi('doi: 10.1000/abc')).toBe('10.1000/abc');
  });

  it('keys the first author normalized', () => {
    expect(firstAuthorKey(['McMurray J.', 'Solomon S'])).toBe('mcmurray j');
    expect(firstAuthorKey([])).toBe('');
  });
});

describe('canManageImport', () => {
  it('lets owners and collaborators mutate imports', () => {
    expect(canManageImport('owner')).toBe(true);
    expect(canManageImport('collaborator')).toBe(true);
  });

  it('keeps reviewers, arbitrators, and viewers read-only', () => {
    expect(canManageImport('reviewer')).toBe(false);
    expect(canManageImport('arbitrator')).toBe(false);
    expect(canManageImport('viewer')).toBe(false);
  });
});
