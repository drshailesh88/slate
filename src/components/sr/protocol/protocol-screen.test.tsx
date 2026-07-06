import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProtocolViewDTO } from '@/lib/sr/protocol/types';

// The server actions pull in next/cache + server-only code; mock them so the
// client screen renders in isolation (we assert markup for each protocol state).
vi.mock('@/lib/sr/protocol/actions', () => ({
  saveDraftAction: vi.fn(),
  lockProtocolAction: vi.fn(),
  amendProtocolAction: vi.fn(),
}));

import { ProtocolScreen } from './protocol-screen';

const REVIEW = '00000000-0000-4000-8000-000000000001';

const criterion = {
  id: 'c1',
  kind: 'include' as const,
  label: 'Adults with heart failure',
  instruction: 'Include adults with heart failure.',
  answerStructure: 'yes_no_maybe' as const,
};

const draftDto: ProtocolViewDTO = {
  reviewId: REVIEW,
  status: 'draft',
  currentVersion: null,
  content: {
    researchQuestion: 'Do SGLT2 inhibitors help?',
    pico: {
      population: 'Adults with HF',
      intervention: 'SGLT2i',
      comparator: 'Placebo',
      outcome: 'Hospitalisation',
      studyDesign: 'RCT',
    },
    criteria: [criterion],
  },
  versions: [],
  lockedAt: null,
  lockedBy: null,
};

const lockedDto: ProtocolViewDTO = {
  ...draftDto,
  status: 'locked',
  currentVersion: 2,
  lockedAt: '2026-07-02T12:30:00.000Z',
  lockedBy: 'user-1',
  versions: [
    {
      version: 1,
      content: draftDto.content,
      reason: null,
      lockedAt: '2026-07-01T10:00:00.000Z',
      lockedBy: 'user-1',
    },
    {
      version: 2,
      content: draftDto.content,
      reason: 'Widened to include HFpEF.',
      lockedAt: '2026-07-02T12:30:00.000Z',
      lockedBy: 'user-2',
    },
  ],
};

describe('ProtocolScreen — draft state', () => {
  it('renders the PICO fields, research question, criteria, and lock control', () => {
    const html = renderToStaticMarkup(
      <ProtocolScreen dto={draftDto} canEdit />,
    );
    expect(html).toContain('Research question');
    expect(html).toContain('Population');
    expect(html).toContain('Study design');
    expect(html).toContain('Inclusion');
    expect(html).toContain('Lock protocol');
    expect(html).toContain('Draft');
    expect(html).not.toContain('Amendment history');
  });
});

describe('ProtocolScreen — locked state', () => {
  it('shows the version chip, amend control, and the dated amendment history', () => {
    const html = renderToStaticMarkup(
      <ProtocolScreen
        dto={lockedDto}
        canEdit
        authorNames={{ 'user-2': 'Dr. Singh' }}
      />,
    );
    expect(html).toContain('Locked');
    expect(html).toContain('v2');
    expect(html).toContain('Amend protocol');
    expect(html).toContain('Amendment history');
    expect(html).toContain('Baseline lock');
    expect(html).toContain('Widened to include HFpEF.');
    expect(html).toContain('Dr. Singh');
    // Locked criteria render read-only, not as an editable lock button-less form.
    expect(html).toContain('Inclusion criteria');
  });
});

describe('ProtocolScreen — read-only member', () => {
  it('hides every edit control and shows the read-only note', () => {
    const html = renderToStaticMarkup(
      <ProtocolScreen dto={draftDto} canEdit={false} />,
    );
    expect(html).toContain('Read only');
    expect(html).not.toContain('Lock protocol');
    expect(html).not.toContain('Save draft');
  });
});
