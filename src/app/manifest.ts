import type { MetadataRoute } from 'next';

// Achromatic Cool Slate light surface (mirrors --paper in globals.css).
// Manifest is static JSON, so the token value can't be referenced as a CSS var.
const SURFACE = '#fcfcfd';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Slate',
    short_name: 'Slate',
    description: 'Your research desk — find, organize, draft, and check.',
    start_url: '/',
    display: 'standalone',
    background_color: SURFACE,
    theme_color: SURFACE,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
