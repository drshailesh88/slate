# Slate — Logo & Identity

Append this section to DESIGN.md. These rules are written for agents: follow them exactly.

## The Mark — "The Slate"

A framed tablet with a single ascending chalk stroke. The frame is the wooden
border of a school slate; the stroke is the first mark of writing on it. The
outline weight echoes the system's shadow-as-border line; the corner radius
echoes the UI's radius vocabulary.

Construction (24-unit grid):
- Frame: rect at x 6, y 3.5, width 12, height 17, corner radius 3.2, stroke 2, no fill
- Chalk stroke: line from (9.4, 14.6) to (14.6, 9.4), stroke 2, butt caps (flat-cut)
- Small-size variant (renders ≤ 24 px): identical geometry, stroke 2.4

## Color

- The identity is achromatic. Two colors exist: `#171717` on light surfaces, `#EDEDED` on dark surfaces.
- Never render the logo in blue `#0072F5` — blue marks interaction, never identity.
- Never apply gradients, shadows, or opacity to the logo.
- In app UI, use `slate-mark.svg` (currentColor) so the mark inherits the theme.

## Wordmark

- "Slate" set in Geist Sans 600 (SemiBold), letter-spacing −4% (−0.04 em).
- Never fake it with another font or weight. If typing it live in HTML instead
  of using the asset: `font-weight: 600; letter-spacing: -0.04em;`.
- Title case: "Slate". Never "SLATE" or "slate" in the wordmark.

## Lockup

- Mark's visual height equals the wordmark's cap height (1 : 1).
- Gap between mark and wordmark: 0.47 × cap height.
- Mark aligns to cap top and baseline. Use the provided lockup files; don't rebuild.

## Clear Space & Minimum Sizes

- Clear space: 25% of the rendered mark height on all sides. Nothing enters it.
- Minimum mark size: 16 px (use the small variant at ≤ 24 px).
- Minimum lockup height: 20 px. Below that, use the mark alone.

## Files

| File | Use |
| --- | --- |
| `01-mark/slate-mark.svg` | In-app, theme-aware (currentColor) |
| `01-mark/slate-mark-light.svg` / `-dark.svg` | Fixed-color placements |
| `01-mark/slate-mark-small.svg` | ≤ 24 px renders, stroke 2.4 |
| `02-wordmark/slate-wordmark-*.svg` | Wordmark alone |
| `03-lockup/slate-lockup-*.svg` | Primary logo, headers & marketing |
| `04-favicon/favicon.svg` | Browser tab; auto-inverts via `prefers-color-scheme` |
| `04-favicon/favicon.ico`, `favicon-16/32/48.png` | Legacy favicon set |
| `05-app-icon/apple-touch-icon.png` | iOS home screen (180) |
| `05-app-icon/icon-192.png`, `icon-512.png` | PWA manifest icons |
| `05-app-icon/icon-512-maskable.png` | Manifest `purpose: maskable` (46% safe zone) |
| `06-og/og-image-light.png` / `-dark.png` | Social cards, 1200 × 630 |

## Head Snippet

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="/og-image-light.png">
```

```json
// manifest.json icons
[
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Don't

- Don't recolor, rotate, skew, outline, or add effects to the mark.
- Don't change the stroke weight (except the provided small-size variant).
- Don't place the logo on photos, gradients, or any non-flat surface.
- Don't pair the mark with any wordmark other than the provided one.
- Don't put the mark inside another container — the frame is the container.
