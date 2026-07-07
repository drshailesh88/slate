# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## What this is

Slate is the ScholarSync product app: a citation-first research and writing
desk for clinicians and academics. This repo is a clean re-home; the
foundation (shell + Home) landed as the genesis on `main`.

## Stack

- Next.js 16 (App Router, TypeScript, React 19), pnpm, Node 20+
- Auth: WorkOS AuthKit via `@workos-inc/authkit-nextjs`
- DB: Neon serverless Postgres + Drizzle ORM (`drizzle-orm` + `drizzle-kit`)
- Icons: Lucide only. Motion: CSS transitions by default.

## Build / run / migrate

- `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` (zero warnings)
  · `pnpm format`
- `pnpm db:generate` — schema → SQL migration (no live DB needed)
- `pnpm db:migrate` — applies migrations; needs `DATABASE_URL_UNPOOLED`
- Env vars documented in `.env.example`: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`,
  `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`,
  `DATABASE_URL` (pooled, runtime), `DATABASE_URL_UNPOOLED` (direct,
  drizzle-kit). Never commit `.env*` (only `.env.example` is tracked).

## Design authority (FROZEN)

- `docs/design/design.md` is the frozen skin: tokens, typography, spacing,
  components, icons, motion, and the §9 hard rules. Specs live in
  `docs/design/specs/`; `docs/design/reference/*.html` is rendered ground
  truth. Do not invent visual values.
- **Ink is the brand**: ~95% grayscale, no chromatic brand color; primary
  buttons are solid `--ink` with a white label, never colored.
- **Cool Slate is the default theme** — never reskin to the warm variant.
  Dark tokens exist under `:root[data-theme="dark"]`.
- **Tokens only in component code**: no raw hex, no raw durations/easings —
  reference the CSS variables in `src/app/globals.css`. Animate
  `transform`/`opacity` only; honor `prefers-reduced-motion`.
- Serif (Source Serif 4) titles · sans (DM Sans) body/UI · mono
  (JetBrains Mono) all numbers. Hairline `--line` borders; no shadows or
  gradients.
- `docs/design/` is excluded from Prettier — never reformat it.

## Brand / identity

- `docs/design/BRAND.md` is the brand authority (sibling to the frozen skin);
  the full asset kit lives in `docs/design/brand/**` (`01-mark`, `02-wordmark`,
  `03-lockup`, `04-favicon`, `05-app-icon`, `06-og`, plus `concept/`). BRAND.md
  says "append to DESIGN.md" — ignore that; `design.md` is FROZEN, so BRAND.md
  stands beside it instead.
- **Achromatic mark** — "the Slate": a framed tablet + one ascending chalk
  stroke. Two colors only (`#171717` light / `#EDEDED` dark). Never render the
  logo in blue, and never add gradients, shadows, opacity, rotation, or skew.
- **In-app logo is `src/components/shell/brand.tsx`** (`<Brand variant="lockup|mark">`),
  faithful to the kit SVGs and drawn with `currentColor` so it inherits `--ink`
  and tracks the `[data-theme]` toggle. Do not hardcode the logo color; do not
  live-type "Slate" (the wordmark is Geist, which the app does not load — a
  fixed-color `<img>` also can't follow the theme toggle). Use the SVG assets.
- Respect BRAND.md clear-space (25% of mark height) and min sizes (mark 16 px;
  small variant, stroke 2.4, ≤ 24 px; lockup ≥ 20 px, else mark alone).
- Favicons/OG/manifest use App Router file conventions in `src/app`
  (`favicon.ico`, `icon.svg`, `apple-icon.png`, `opengraph-image.png`,
  `twitter-image.png`, `manifest.ts`); PWA icons live in `public/`.
- Open conflict for a human: BRAND.md names interaction blue `#0072F5`, but
  `design.md §9.1` kills Google-blue and `--accent` is `#3d5a80`. The mark is
  achromatic so nothing wires the blue — left unresolved on purpose.

## Architecture notes

- **`src/` layout is load-bearing**: a search engine will later be imported
  verbatim as code into `src/lib/search/**` with couplings at
  `src/lib/http/**`, `src/lib/ai/models.ts`, `src/types/search.ts`, exposed
  via `src/app/api/search/unified/route.ts`. Do not design search as an
  external HTTP service, and keep these paths free.
- Auth: `src/proxy.ts` (Next 16 proxy convention; `authkitProxy` — the
  `middleware.ts` name is deprecated in Next 16). Session helpers in
  `src/lib/auth/session.ts`. Dev bypass: without WorkOS creds and outside
  production, a mock session (`Dr. Singh`) renders the shell; real auth
  activates when creds land. `/auth/callback` JIT-upserts the user row.
- DB: users are keyed on the stable WorkOS user id (`workos_user_id`,
  unique). Runtime uses the neon-http driver with the pooled URL;
  drizzle-kit needs the direct (unpooled) URL.
- Fonts load via `next/font`; the variable classes must stay on `<html>`
  (not `<body>`) — token vars in `:root` reference them, and var() chains
  resolve against `:root`.

- Add durable project-specific notes here as they are discovered through real work.
