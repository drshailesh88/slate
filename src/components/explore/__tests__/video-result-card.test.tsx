import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoResultCard } from '../video-result-card';
import type { UnifiedSearchResult } from '@/types/search';

function makeResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'Diagnosing Atrial Fibrillation: A Clinical Review',
    url: 'https://www.youtube.com/watch?v=soH2Siy_ho4',
    domain: 'youtube.com',
    sourceLabel: 'Harvard Medical School Continuing Education',
    publishedAt: '2026-02-10T00:00:00Z',
    authors: [],
    journal: '',
    year: 2026,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: [],
    ...overrides,
  };
}

describe('VideoResultCard', () => {
  it('renders the derived thumbnail src, channel, and title', () => {
    const result = makeResult();
    render(<VideoResultCard result={result} />);

    const thumbnail = screen.getByRole('img');
    expect(thumbnail).toHaveAttribute(
      'src',
      'https://img.youtube.com/vi/soH2Siy_ho4/mqdefault.jpg',
    );

    expect(
      screen.getByText(/Harvard Medical School Continuing Education/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Diagnosing Atrial Fibrillation: A Clinical Review'),
    ).toBeInTheDocument();
  });

  it('renders an Open link to getResultUrl with target=_blank and rel=noopener noreferrer', () => {
    const result = makeResult();
    render(<VideoResultCard result={result} />);

    const links = screen.getAllByRole('link', { name: /open|diagnosing/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        'https://www.youtube.com/watch?v=soH2Siy_ho4',
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('never renders a Cite button', () => {
    render(<VideoResultCard result={makeResult()} />);

    expect(
      screen.queryByRole('button', { name: /cite/i }),
    ).not.toBeInTheDocument();
  });

  it('never renders a duration', () => {
    render(<VideoResultCard result={makeResult()} />);

    expect(screen.queryByText(/duration/i)).not.toBeInTheDocument();
  });

  it('never renders a transcript/takeaways affordance', () => {
    render(<VideoResultCard result={makeResult()} />);

    expect(screen.queryByText(/transcript|takeaways/i)).not.toBeInTheDocument();
  });

  it('hides the thumbnail image on load error instead of showing a broken image', () => {
    const result = makeResult();
    render(<VideoResultCard result={result} />);

    const thumbnail = screen.getByRole('img');
    fireEvent.error(thumbnail);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders no thumbnail image when the url is not a youtube link', () => {
    const result = makeResult({ url: 'https://example.com/not-youtube' });
    render(<VideoResultCard result={result} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the title as plain text (no link) when getResultUrl is undefined', () => {
    const result = makeResult({ url: undefined });
    render(<VideoResultCard result={result} />);

    expect(
      screen.queryByRole('link', { name: /diagnosing/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Diagnosing Atrial Fibrillation: A Clinical Review'),
    ).toBeInTheDocument();
  });
});
