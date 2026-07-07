import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConflictsViewDTO } from '@/lib/sr/conflicts/types';

// The resolve action pulls in next/cache + server-only code, and the card uses
// the app router — mock both so the client screen renders in isolation.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(app)/systematic-review/[reviewId]/conflicts/actions', () => ({
  resolveConflictAction: vi.fn(),
}));

import { ConflictsScreen } from './conflicts-screen';

const REVIEW = '00000000-0000-4000-8000-000000000001';

const reconcileDto: ConflictsViewDTO = {
  reviewId: REVIEW,
  stage: 'title_abstract',
  state: 'reconcile',
  kappa: { value: 0.5, label: 'Moderate' },
  conflicts: [
    {
      studyId: 'st-1',
      title: 'Trial One',
      authors: 'Ng',
      journal: 'JAMA',
      year: 2021,
      decisions: [
        {
          reviewerId: 'u-a',
          reviewerName: 'Dr. A',
          decision: 'include',
          isAi: false,
          excludeReasonDetail: null,
        },
        {
          reviewerId: 'u-b',
          reviewerName: 'Dr. B',
          decision: 'exclude',
          isAi: false,
          excludeReasonDetail: 'Wrong population.',
        },
      ],
      resolution: null,
    },
    {
      studyId: 'st-2',
      title: 'Trial Two',
      authors: 'Reyes',
      journal: 'NEJM',
      year: 2022,
      decisions: [
        {
          reviewerId: 'u-a',
          reviewerName: 'Dr. A',
          decision: 'include',
          isAi: false,
          excludeReasonDetail: null,
        },
        {
          reviewerId: 'ai',
          reviewerName: null,
          decision: 'exclude',
          isAi: true,
          excludeReasonDetail: null,
        },
      ],
      resolution: {
        studyId: 'st-2',
        method: 'align_on_one',
        decision: 'include',
        arbitratorId: null,
        arbitratorName: null,
        note: null,
        resolvedBy: 'u-a',
        resolvedByName: 'Dr. A',
        resolvedAt: '2026-07-07T10:00:00.000Z',
      },
    },
  ],
  eligibleArbitrators: [{ userId: 'u-c', name: 'Dr. C' }],
  canResolve: true,
};

describe('ConflictsScreen — reconcile', () => {
  it('shows both opposing calls at equal weight, neither preferred', () => {
    const html = renderToStaticMarkup(<ConflictsScreen dto={reconcileDto} />);
    // Both calls present; the equal-weight group is labelled.
    expect(html).toContain('equal weight');
    expect(html).toContain('Include');
    expect(html).toContain('Exclude');
    expect(html).toContain('Dr. A');
    expect(html).toContain('Dr. B');
    // No default primary/selected column — equal reviewers (non-negotiable #1).
    expect(html).not.toContain('aria-selected');
    expect(html).not.toContain('primary');
  });

  it('renders every conflict expanded — none auto-collapsed/hidden (#2)', () => {
    const html = renderToStaticMarkup(<ConflictsScreen dto={reconcileDto} />);
    expect(html).toContain('Trial One');
    expect(html).toContain('Trial Two');
  });

  it('offers explicit human resolution controls (no auto-resolve, #3)', () => {
    const html = renderToStaticMarkup(<ConflictsScreen dto={reconcileDto} />);
    expect(html).toContain('Align on one');
    expect(html).toContain('Send to arbitrator');
    expect(html).toContain('Dr. C');
  });

  it('shows the κ readout and the logged resolution method', () => {
    const html = renderToStaticMarkup(<ConflictsScreen dto={reconcileDto} />);
    expect(html).toContain('κ 0.50 · Moderate');
    expect(html).toContain('Resolved');
    expect(html).toContain('Aligned on Include');
  });

  it('labels the AI reviewer as a distinct input', () => {
    const html = renderToStaticMarkup(<ConflictsScreen dto={reconcileDto} />);
    expect(html).toContain('AI reviewer');
  });
});

describe('ConflictsScreen — withheld (pre-unblind)', () => {
  it('renders the blinded state and NO conflict data', () => {
    const withheld: ConflictsViewDTO = {
      reviewId: REVIEW,
      stage: 'title_abstract',
      state: 'withheld',
      kappa: { value: null, label: '—' },
      conflicts: [],
      eligibleArbitrators: [],
      canResolve: false,
    };
    const html = renderToStaticMarkup(<ConflictsScreen dto={withheld} />);
    expect(html).toContain('Conflicts open after unblind');
    expect(html).toContain('Blinded');
    // No opposing calls, no κ value, no study titles leak.
    expect(html).not.toContain('Trial One');
    expect(html).not.toContain('Align on one');
    expect(html).not.toContain('κ 0');
  });
});

describe('ConflictsScreen — read-only member', () => {
  it('hides the resolution controls and shows the read-only note', () => {
    const html = renderToStaticMarkup(
      <ConflictsScreen dto={{ ...reconcileDto, canResolve: false }} />,
    );
    expect(html).toContain('Read only');
    expect(html).not.toContain('Align on one');
    // Conflicts are still shown — read-only members can review them.
    expect(html).toContain('Trial One');
  });
});
