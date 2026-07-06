import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above imports, so shared mocks/sentinels must
// live in vi.hoisted (also hoisted) to be referenceable inside them.
const h = vi.hoisted(() => {
  // notFound() throws internally in Next; a recognizable sentinel lets the test
  // assert the layout took the 404 path.
  const NOT_FOUND = new Error('NEXT_NOT_FOUND');
  return {
    NOT_FOUND,
    notFound: vi.fn(() => {
      throw NOT_FOUND;
    }),
    isSrEnabled: vi.fn(() => true),
    requireMember: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  notFound: h.notFound,
  usePathname: () => '/',
}));

// The real require-member (loaded via importOriginal below) transitively imports
// @workos-inc/authkit-nextjs, which pulls next/cache and fails to resolve under
// vitest. Stub it — the deny paths never reach it. Mirrors require-member.test.
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));

vi.mock('@/lib/sr/flag', () => ({
  isSrEnabled: h.isSrEnabled,
  SR_FLAG_ENV: 'NEXT_PUBLIC_ENABLE_SR',
}));

// Partial mock: stub requireMember, keep the real error types + isSrAuthzError
// so the layout's "authz failure → 404" branch is exercised for real.
vi.mock('@/lib/sr/authz/require-member', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/sr/authz/require-member')>();
  return { ...actual, requireMember: h.requireMember };
});

import SrReviewLayout from './layout';
import { ReviewAccessError } from '@/lib/sr/authz/errors';

function renderLayout(reviewId: string) {
  return SrReviewLayout({
    children: null,
    params: Promise.resolve({ reviewId }),
  });
}

beforeEach(() => {
  h.isSrEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SR review layout — deny by default', () => {
  it('404s when the SR flag is off, before any authz or DB work', async () => {
    h.isSrEnabled.mockReturnValue(false);

    await expect(renderLayout('any-review')).rejects.toBe(h.NOT_FOUND);
    expect(h.notFound).toHaveBeenCalledOnce();
    expect(h.requireMember).not.toHaveBeenCalled();
  });

  it('404s for a non-member / foreign / nonexistent reviewId (no leak)', async () => {
    h.requireMember.mockRejectedValue(new ReviewAccessError());

    await expect(renderLayout('foreign-review')).rejects.toBe(h.NOT_FOUND);
    expect(h.requireMember).toHaveBeenCalledWith('foreign-review');
    expect(h.notFound).toHaveBeenCalledOnce();
  });

  it('does NOT mask an infrastructure error as a 404', async () => {
    const dbDown = new Error('connection refused');
    h.requireMember.mockRejectedValue(dbDown);

    await expect(renderLayout('some-review')).rejects.toBe(dbDown);
    expect(h.notFound).not.toHaveBeenCalled();
  });
});
