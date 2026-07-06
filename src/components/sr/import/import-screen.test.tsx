// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportState } from '@/lib/sr/import-service';

// Port of the precursor `import-screen.test.tsx`, adapted to the server-action
// rebuild: the actions + router are mocked so the presentational wiring (ledger,
// queue, and which action each control invokes) is asserted without a DB.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const runImport = vi.fn().mockResolvedValue({ ok: true, imported: 0 });
const runMerge = vi.fn().mockResolvedValue({ ok: true });
const runMarkNotDuplicate = vi.fn().mockResolvedValue({ ok: true });
const runUndoImport = vi.fn().mockResolvedValue({ ok: true });
const runRestoreImport = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/app/(app)/systematic-review/[reviewId]/import/actions', () => ({
  runImport: (...a: unknown[]) => runImport(...a),
  runMerge: (...a: unknown[]) => runMerge(...a),
  runMarkNotDuplicate: (...a: unknown[]) => runMarkNotDuplicate(...a),
  runUndoImport: (...a: unknown[]) => runUndoImport(...a),
  runRestoreImport: (...a: unknown[]) => runRestoreImport(...a),
}));

import { ImportScreen } from './import-screen';

const REVIEW_ID = 'sglt2-hf';

function makeState(): ImportState {
  return {
    ledger: {
      batches: [
        {
          id: 'b-pubmed',
          source: 'PubMed',
          target: 'screen',
          ai: false,
          refs: 214,
          duplicatesRemoved: 11,
        },
        {
          id: 'b-ai',
          source: 'AI search',
          target: 'screen',
          ai: true,
          refs: 56,
          duplicatesRemoved: 4,
        },
      ],
      totalDuplicatesRemoved: 24,
    },
    queue: [
      {
        candidate: {
          id: 'std-dapa',
          refId: 2,
          title: 'DAPA-HF dapagliflozin in heart failure',
          authors: ['McMurray J'],
          year: 2019,
          dupe: {
            status: 'needs_review',
            matchedOn: ['title', 'year', 'first author'],
            ofRefId: 1,
          },
        },
        matchedOn: ['title', 'year', 'first author'],
        original: {
          id: 'std-orig',
          refId: 1,
          title: 'DAPA-HF original',
          authors: ['McMurray J'],
          year: 2019,
        },
      },
    ],
    poolSize: 388,
    undoneBatches: [],
  };
}

function click(el: Element | null | undefined) {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ImportScreen', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(canManage = true, state: ImportState = makeState()) {
    act(() => {
      root.render(
        <ImportScreen
          reviewId={REVIEW_ID}
          canManage={canManage}
          state={state}
        />,
      );
    });
  }

  function findButton(text: string, scope: ParentNode = container) {
    return Array.from(scope.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(text),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the import ledger with one card per batch and the honest count', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('Import history');
    expect(text).toContain('24 total duplicates removed');
    expect(text).toContain('PubMed');
    expect(text).toContain('Added via AI search');
    expect(text).toContain('214');
  });

  it('states that there is no search builder — results arrive, deduped', () => {
    render();
    expect(container.textContent).toContain('no search-strategy builder');
  });

  it('queues uncertain duplicates pairwise with what matched', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('Possible duplicate');
    expect(text).toContain('Matched on title + year + first author');
    expect(text).toContain('DAPA-HF');
  });

  it('merge invokes the merge action for that study', () => {
    render();
    const dupeCard = Array.from(container.querySelectorAll('div')).find((el) =>
      el.textContent?.includes('Possible duplicate'),
    );
    click(findButton('Merge', dupeCard));
    expect(runMerge).toHaveBeenCalledWith(REVIEW_ID, 'std-dapa');
  });

  it('not-a-duplicate invokes the keep action', () => {
    render();
    click(findButton('Not a duplicate'));
    expect(runMarkNotDuplicate).toHaveBeenCalledWith(REVIEW_ID, 'std-dapa');
  });

  it('undo import invokes the undo action for that batch', () => {
    render();
    const aiCard = Array.from(container.querySelectorAll('div')).find(
      (el) =>
        el.className.includes('ledgerCard') &&
        el.textContent?.includes('AI search'),
    );
    click(findButton('Undo import', aiCard));
    expect(runUndoImport).toHaveBeenCalledWith(REVIEW_ID, 'b-ai');
  });

  it('shows an all-clear when the duplicate queue is empty', () => {
    const state = makeState();
    state.queue = [];
    render(true, state);
    expect(container.textContent).toContain('No uncertain duplicates');
  });

  it('offers a reversible restore for an undone import', () => {
    const state = makeState();
    state.undoneBatches = [{ id: 'b-old', source: 'Scopus', refs: 40 }];
    render(true, state);
    expect(container.textContent).toContain('Import undone');
    click(findButton('Restore'));
    expect(runRestoreImport).toHaveBeenCalledWith(REVIEW_ID, 'b-old');
  });

  it('read-only members see the ledger but no import form or dedup controls', () => {
    render(false);
    expect(container.textContent).toContain('PubMed');
    expect(findButton('Import references')).toBeUndefined();
    expect(findButton('Merge')).toBeUndefined();
    expect(container.textContent).toContain('read-only access');
  });
});
