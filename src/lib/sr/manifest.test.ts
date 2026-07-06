import { describe, expect, it } from 'vitest';
import { systematicReviewManifest } from './manifest';
import { SR_FLAG_ENV } from './flag';

describe('systematicReviewManifest', () => {
  it('is the stable seam a Home launcher consumes', () => {
    expect(systematicReviewManifest.id).toBe('systematic-review');
    expect(systematicReviewManifest.name).toBe('Systematic Review');
    expect(systematicReviewManifest.entryRoute).toBe('/systematic-review');
    expect(systematicReviewManifest.flag).toBe(SR_FLAG_ENV);
  });

  it('exposes a renderable Lucide icon component', () => {
    // Lucide icons are React components (forwardRef objects), not strings.
    expect(systematicReviewManifest.icon).toBeTruthy();
    expect(['function', 'object']).toContain(
      typeof systematicReviewManifest.icon,
    );
  });
});
