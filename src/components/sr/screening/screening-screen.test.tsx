// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreeningViewDTO } from '@/lib/sr/screening/types';

// The rendered screen must never carry co-reviewer data, an AI verdict, or an AI
// relevance score — this is the client half of the T12 side-channel guard (the
// server half is own-decisions.test.ts). The view DTO is own-only by type; here
// we prove the DOM the reviewer actually sees stays clean, and that I/M/E wiring
// only ever sends the caller's own decision (never a reviewerId — the server
// stamps that).

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => {
    return <a href={href}>{children}</a>;
  },
}));

const castDecisionAction = vi.fn().mockResolvedValue({ ok: true });
const finishScreeningAction = vi.fn().mockResolvedValue({ ok: true });
const unblindScreeningAction = vi
  .fn()
  .mockResolvedValue({ ok: true, flipped: true });
vi.mock('@/app/(app)/systematic-review/[reviewId]/screening/actions', () => ({
  castDecisionAction: (...a: unknown[]) => castDecisionAction(...a),
  finishScreeningAction: (...a: unknown[]) => finishScreeningAction(...a),
  unblindScreeningAction: (...a: unknown[]) => unblindScreeningAction(...a),
}));

import { ScreeningScreen } from './screening-screen';

const REVIEW_ID = 'sglt2-hf';

function makeView(overrides: Partial<ScreeningViewDTO> = {}): ScreeningViewDTO {
  return {
    reviewId: REVIEW_ID,
    reviewTitle: 'SGLT2 inhibitors for HFpEF',
    reviewType: 'Intervention review',
    phase: 'independent',
    stage: 'title_abstract',
    stageLabel: 'Title & abstract',
    canScreen: true,
    canUnblind: false,
    finished: false,
    studies: [
      {
        id: 'st-1',
        refId: 'PMID-1',
        title: 'Dapagliflozin in heart failure',
        authors: 'Smith J; Lee K',
        journal: 'NEJM',
        year: 2021,
        doi: '10.1/abc',
        abstract: 'A randomised controlled trial of an SGLT2 inhibitor.',
      },
      {
        id: 'st-2',
        refId: 'PMID-2',
        title: 'Empagliflozin outcomes',
        authors: 'Nguyen T',
        journal: 'Lancet',
        year: 2020,
        doi: null,
        abstract: null,
      },
    ],
    decisions: [
      {
        studyId: 'st-1',
        decision: 'include',
        excludeReasonCode: null,
        excludeReasonDetail: null,
        locked: false,
      },
    ],
    criteria: {
      include: [
        { id: 'c1', label: 'Randomised controlled trial', instruction: '' },
      ],
      exclude: [{ id: 'c2', label: 'Paediatric population', instruction: '' }],
    },
    highlightTerms: { include: ['SGLT2 inhibitor'], exclude: [] },
    aiRanking: null,
    progress: { finishedReviewers: 1, totalReviewers: 3 },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(view: ScreeningViewDTO) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<ScreeningScreen view={view} />);
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ScreeningScreen — independent', () => {
  it('renders the 3-zone surface: study, blind banner, and I / M / E', () => {
    render(makeView());
    const html = container.innerHTML;
    expect(html).toContain('Dapagliflozin in heart failure');
    expect(html).toContain('Independent screening');
    expect(buttonByText('Include')).toBeTruthy();
    expect(buttonByText('Maybe')).toBeTruthy();
    expect(buttonByText('Exclude')).toBeTruthy();
  });

  it('shows the reviewer own decision as selected (aria-pressed)', () => {
    render(makeView());
    const include = buttonByText('Include');
    expect(include?.getAttribute('aria-pressed')).toBe('true');
  });

  it('SIDE CHANNEL: renders no AI score or verdict, and no co-reviewer marker', () => {
    render(makeView());
    const text = container.textContent ?? '';
    // No AI relevance score, no AI verdict, no "suggests" pre-selection.
    expect(text).not.toMatch(/\/\s*5\b/); // e.g. "4.2 / 5"
    expect(text.toLowerCase()).not.toContain('ai suggests');
    expect(text.toLowerCase()).not.toContain('suggests:');
    expect(text.toLowerCase()).not.toContain('relevance score');
    // The AI is described as blinded, verdict withheld until reconciliation.
    expect(text.toLowerCase()).toContain('only at reconciliation');
  });

  it('the AI-suggested order toggle is present, labeled, and disabled with no ranking', () => {
    render(makeView({ aiRanking: null }));
    const text = container.textContent ?? '';
    expect(text).toContain('AI-suggested order');
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox?.disabled).toBe(true);
    expect(checkbox?.checked).toBe(false);
  });

  it('clicking Exclude sends only the caller own decision (no reviewerId from the client)', () => {
    render(makeView({ decisions: [] }));
    act(() => {
      buttonByText('Exclude')?.click();
    });
    expect(castDecisionAction).toHaveBeenCalledTimes(1);
    const arg = castDecisionAction.mock.calls[0][0];
    expect(arg).toMatchObject({
      reviewId: REVIEW_ID,
      studyId: 'st-1',
      decision: 'exclude',
    });
    // The client NEVER supplies a reviewerId — the server stamps ctx.userId.
    expect(arg).not.toHaveProperty('reviewerId');
  });

  it('keyboard I casts an include for the current study', () => {
    render(makeView({ decisions: [] }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
    });
    expect(castDecisionAction).toHaveBeenCalledWith(
      expect.objectContaining({ studyId: 'st-1', decision: 'include' }),
    );
  });
});

describe('ScreeningScreen — owner unblind', () => {
  it('an owner sees the reveal control but no I / M / E screening buttons', () => {
    render(makeView({ canScreen: false, canUnblind: true, decisions: [] }));
    expect(buttonByText('Reveal for reconciliation')).toBeTruthy();
    expect(buttonByText('Include')).toBeUndefined();
  });

  it('reveal is a two-step confirm that calls the one-way unblind action', () => {
    render(makeView({ canScreen: false, canUnblind: true, decisions: [] }));
    act(() => {
      buttonByText('Reveal for reconciliation')?.click();
    });
    expect(container.textContent).toContain("This can't be re-hidden");
    act(() => {
      buttonByText('Reveal & reconcile')?.click();
    });
    expect(unblindScreeningAction).toHaveBeenCalledWith(REVIEW_ID);
  });
});

describe('ScreeningScreen — reconcile hand-off', () => {
  it('shows the reconciliation hand-off, not the vote triad', () => {
    render(makeView({ phase: 'reconcile', decisions: [], studies: [] }));
    const text = container.textContent ?? '';
    expect(text).toContain('Screening revealed for reconciliation');
    expect(buttonByText('Include')).toBeUndefined();
  });
});
