import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcademicResultCard } from '../academic-result-card';
import { JournalQuartileBadge } from '../journal-quartile-badge';
import badgeStyles from '../journal-quartile-badge.module.css';
import { formatCitation } from '../format-citation';
import type { UnifiedSearchResult } from '@/types/search';

function makeResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'SGLT2i in HF',
    authors: ['Zannad F', 'Ferreira JP'],
    journal: 'The Lancet',
    year: 2020,
    citationCount: 42,
    publicationTypes: [],
    isOpenAccess: false,
    sources: [],
    ...overrides,
  };
}

describe('JournalQuartileBadge', () => {
  it('renders nothing when quartile is null', () => {
    const { container } = render(<JournalQuartileBadge quartile={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when quartile is undefined', () => {
    const { container } = render(<JournalQuartileBadge quartile={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['Q1', 'topTier'],
    ['Q2', 'topTier'],
    ['Q3', 'lowerTier'],
    ['Q4', 'lowerTier'],
  ] as const)('applies the %s tier class for %s', (quartile, tierKey) => {
    render(<JournalQuartileBadge quartile={quartile} />);
    const badge = screen.getByText(quartile);

    expect(badge.className).toContain(badgeStyles[tierKey]);
  });

  it('applies the top-tier class (not the lower-tier class) for Q1', () => {
    render(<JournalQuartileBadge quartile="Q1" />);
    const badge = screen.getByText('Q1');

    expect(badge.className).toContain(badgeStyles.topTier);
    expect(badge.className).not.toContain(badgeStyles.lowerTier);
  });

  it('applies the lower-tier class (not the top-tier class) for Q3', () => {
    render(<JournalQuartileBadge quartile="Q3" />);
    const badge = screen.getByText('Q3');

    expect(badge.className).toContain(badgeStyles.lowerTier);
    expect(badge.className).not.toContain(badgeStyles.topTier);
  });
});

describe('AcademicResultCard', () => {
  it('links the title to result.url when present', () => {
    const result = makeResult({
      url: 'https://example.com/paper',
      doi: '10.1016/x',
    });
    render(<AcademicResultCard result={result} />);

    const link = screen.getByRole('link', { name: /SGLT2i in HF/ });
    expect(link).toHaveAttribute('href', 'https://example.com/paper');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('falls back to the DOI link when url is absent', () => {
    const result = makeResult({ url: undefined, doi: '10.1016/x' });
    render(<AcademicResultCard result={result} />);

    const link = screen.getByRole('link', { name: /SGLT2i in HF/ });
    expect(link).toHaveAttribute('href', 'https://doi.org/10.1016/x');
  });

  it('renders the title as plain text (no link) when neither url nor doi is present', () => {
    const result = makeResult({ url: undefined, doi: undefined });
    render(<AcademicResultCard result={result} />);

    expect(
      screen.queryByRole('link', { name: /SGLT2i in HF/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('SGLT2i in HF')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the Cite action and copies formatCitation(result) to the clipboard on click', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const result = makeResult({ doi: '10.1016/x' });
    render(<AcademicResultCard result={result} />);

    const citeButton = screen.getByRole('button', { name: /cite/i });
    await user.click(citeButton);

    expect(writeText).toHaveBeenCalledWith(formatCitation(result));
  });

  it('omits the study-type chip when studyType is absent', () => {
    const result = makeResult({ studyType: undefined });
    render(<AcademicResultCard result={result} />);

    expect(screen.queryByText(/RCT|Cohort|Case Study/)).not.toBeInTheDocument();
  });

  it('renders the study-type chip when studyType is present', () => {
    const result = makeResult({ studyType: 'RCT' });
    render(<AcademicResultCard result={result} />);

    expect(screen.getByText('RCT')).toBeInTheDocument();
  });

  it('omits the abstract snippet when abstract is absent', () => {
    const result = makeResult({ abstract: undefined });
    const { container } = render(<AcademicResultCard result={result} />);

    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('shows all authors in the meta line when there are 3 or fewer', () => {
    const result = makeResult({
      authors: ['Zannad F', 'Ferreira JP', 'Pocock SJ'],
    });
    render(<AcademicResultCard result={result} />);

    expect(
      screen.getByText(/Zannad F, Ferreira JP, Pocock SJ/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/et al\./)).not.toBeInTheDocument();
  });

  it('truncates the meta line to the first 3 authors + "et al." when there are more than 3', () => {
    const result = makeResult({
      authors: [
        'Zannad F',
        'Ferreira JP',
        'Pocock SJ',
        'McMurray JJV',
        'Packer M',
      ],
    });
    render(<AcademicResultCard result={result} />);

    expect(
      screen.getByText(/Zannad F, Ferreira JP, Pocock SJ et al\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/McMurray JJV/)).not.toBeInTheDocument();
  });

  it('still uses the full author list for formatCitation even when the card truncates', () => {
    const authors = [
      'Zannad F',
      'Ferreira JP',
      'Pocock SJ',
      'McMurray JJV',
      'Packer M',
    ];
    const result = makeResult({ authors, doi: '10.1016/x' });

    expect(formatCitation(result)).toContain(authors.join(', '));
  });
});
