import { describe, it, expect } from 'vitest';
import { youtubeVideoId, youtubeThumbnail } from '@/components/explore/youtube';

describe('youtube helpers', () => {
  it('extracts id from watch url', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=soH2Siy_ho4')).toBe(
      'soH2Siy_ho4',
    );
  });
  it('extracts id from youtu.be', () => {
    expect(youtubeVideoId('https://youtu.be/abc123')).toBe('abc123');
  });
  it('null for non-youtube', () => {
    expect(youtubeVideoId('https://example.com')).toBeNull();
    expect(youtubeVideoId(undefined)).toBeNull();
  });
  it('null for a youtube url with no video id', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/')).toBeNull();
  });
  it('null for malformed input', () => {
    expect(youtubeVideoId('not a url')).toBeNull();
    expect(youtubeVideoId('')).toBeNull();
  });
  it('builds thumbnail url', () => {
    expect(youtubeThumbnail('https://www.youtube.com/watch?v=xyz')).toBe(
      'https://img.youtube.com/vi/xyz/mqdefault.jpg',
    );
    expect(youtubeThumbnail('https://example.com')).toBeNull();
  });
  it('builds thumbnail url from a youtu.be link', () => {
    expect(youtubeThumbnail('https://youtu.be/abc123')).toBe(
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
    );
  });
  it('returns null for undefined input on both helpers', () => {
    expect(youtubeVideoId(undefined)).toBeNull();
    expect(youtubeThumbnail(undefined)).toBeNull();
  });
});
