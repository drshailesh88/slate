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

## Reading Room synthesis canvas (P0 spike)

- **Where it lives:** `src/app/(app)/reading-room/[roomId]/page.tsx` (server
  component: seeds stub Sources, loads the canvas) renders
  `src/components/reading-room/canvas-mount.tsx`, which `next/dynamic`-imports
  the client `canvas.tsx` with `ssr:false` (React Flow reads the DOM on mount).
  Reachable directly at `/reading-room/<roomId>`; the global shell/nav is
  intentionally untouched (3-homes IA is a separate task).
- **Library:** React Flow — `@xyflow/react` (MIT). Custom `nodeTypes`
  (`SourceNode`, `SynthesisNode`) are our own components in the frozen skin;
  `colorMode` is wired to the app's `data-theme` via `use-color-mode.ts`
  (MutationObserver). Skin overrides live in `canvas-skin.css` (maps
  `--xy-*` → design tokens; no raw hex). `proOptions.hideAttribution` is set.
- **THE invariant — reference, never clone:** a canvas node persists only
  `{ id, type, position, ref, config }` — a type + a foreign key + layout,
  NEVER a content payload. Source titles/authors are hydrated at render time by
  ID (`SourceView`) and stripped on save. This is enforced in TWO places:
  `flow-map.ts#flowToPersisted` (client) and `serialize.ts#toPersistedCanvas`
  (server action boundary). Deleting a canvas must never delete a Source — the
  canvas owns only layout + graph + FKs.
- **Persistence:** `reading_room_canvas` table (`roomId` unique, `nodes`/`edges`
  jsonb) upserted per room by a debounced autosave server action
  (`lib/reading-room/actions.ts`). `sources` is a stub of the Library's Source
  object. Both are additive; the reverse of the migration is `DROP TABLE`.
- **Local DB without Neon:** the runtime driver is chosen by URL scheme in
  `src/lib/db/client.ts` — a `neon.tech` URL → neon-http (production); any other
  `postgres://` → node-postgres. `pnpm db:local` serves an ephemeral PGlite over
  the PG wire protocol on :5433 for `pnpm dev`; `pnpm db:verify` runs the
  reference-not-clone persistence round-trip (docker via
  `scripts/verify-persistence.sh`, else in-process PGlite). Real Postgres in
  both cases — jsonb behaves identically.
- **Migration numbering:** SR builds in parallel on `feat/systematic-review`
  off the same `0000` base; this branch's `0001_*` may need renumbering if the
  two migrations collide at merge.

- Add durable project-specific notes here as they are discovered through real work.
