import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'user_test') }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { search: { limit: 100, windowSeconds: 60 } },
}));
vi.mock('@/lib/ai/query-augment', () => ({ augmentQuery: vi.fn(async () => ({ pubmedQuery: 'p', semanticScholarQuery: 's', openAlexQuery: 'o', suggestedFilters: {} })) }));
vi.mock('@/lib/search/run-search', () => ({
  runLiteratureSearch: vi.fn(async () => ({
    results: [{ title: 'A trial', authors: ['X'], journal: 'JAMA', year: 2024, citationCount: 10, publicationTypes: [], sources: ['pubmed'], isOpenAccess: true }],
    total: 1, matchedTotal: 142, page: 0, perPage: 20,
    sourceCounts: { pubmed: 1 }, sourceStatuses: { pubmed: { source: 'pubmed', status: 'ok' } }, confidence: { level: 'high' },
  })),
}));

import { GET } from '@/app/api/search/unified/route';

const call = (qs: string) => GET(new Request(`http://t/api/search/unified?${qs}`));

describe('GET /api/search/unified (academic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a SearchResponse with honest matchedTotal', async () => {
    const res = await call('q=SGLT2%20in%20HFpEF&tab=academic');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matchedTotal).toBe(142);
    expect(body.sourceStatuses.pubmed.status).toBe('ok');
    expect(body.results[0].title).toBe('A trial');
  });

  it('400s when q is missing', async () => {
    expect((await call('tab=academic')).status).toBe(400);
  });

  it('400s when q exceeds 500 chars', async () => {
    expect((await call(`q=${'a'.repeat(501)}`)).status).toBe(400);
  });
});
