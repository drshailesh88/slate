// Result data only ever gives us the watch/short-link URL, never a raw video
// id — every consumer (thumbnail, embed) starts from this parse.
const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/;

export function youtubeVideoId(url?: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return parsed.searchParams.get('v');
    }

    return null;
  } catch {
    // Malformed input the URL constructor rejects outright; fall back to a
    // permissive regex rather than losing the id entirely.
    const match = url.match(YOUTUBE_ID_PATTERN);
    return match ? match[1] : null;
  }
}

export function youtubeThumbnail(url?: string): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
