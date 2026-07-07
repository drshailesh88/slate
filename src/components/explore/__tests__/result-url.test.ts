import { describe, it, expect } from 'vitest';
import { getResultUrl } from '@/components/explore/result-url';

const base = {
  title: 't',
  authors: [],
  journal: 'j',
  year: 2020,
  citationCount: 0,
  publicationTypes: [],
  sources: [],
  isOpenAccess: false,
};

describe('getResultUrl', () => {
  it('prefers url', () => {
    expect(getResultUrl({ ...base, url: 'https://x' })).toBe('https://x');
  });
  it('falls back to doi', () => {
    expect(getResultUrl({ ...base, doi: '10.1/x' })).toBe(
      'https://doi.org/10.1/x',
    );
  });
  it('undefined when neither', () => {
    expect(getResultUrl(base)).toBeUndefined();
  });
});
