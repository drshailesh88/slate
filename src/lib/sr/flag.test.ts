import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSrEnabled, SR_FLAG_ENV } from './flag';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isSrEnabled', () => {
  it('names the public env var', () => {
    expect(SR_FLAG_ENV).toBe('NEXT_PUBLIC_ENABLE_SR');
  });

  it('is on only for the exact string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_SR', 'true');
    expect(isSrEnabled()).toBe(true);
  });

  it('is off (deny-by-default) for anything else', () => {
    for (const value of ['', 'false', '0', 'TRUE', '1', 'yes']) {
      vi.stubEnv('NEXT_PUBLIC_ENABLE_SR', value);
      expect(isSrEnabled()).toBe(false);
    }
  });

  it('is off when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_SR', undefined as unknown as string);
    expect(isSrEnabled()).toBe(false);
  });
});
