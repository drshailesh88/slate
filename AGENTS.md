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

## Testing (Vitest + Playwright)

- **Unit / integration — Vitest** (`vitest.config.ts`): `pnpm test` (single run,
  CI-safe) · `pnpm test:watch` (watch mode). Environment is `jsdom` with
  `globals: true` (use `describe`/`it`/`expect`/`vi` without importing them; the
  `vitest/globals` types are wired via `vitest-env.d.ts`). Tests are colocated —
  `include` is `src/**/*.{test,spec}.{ts,tsx}` — and the `@/…` alias mirrors
  `tsconfig` so tests import the same way as app code.
- **E2E — Playwright** (`playwright.config.ts`): `pnpm test:e2e`. Specs live in
  `e2e/**/*.spec.ts`. Playwright boots its **own** dev server via `webServer`
  (`pnpm dev --port 3100`, override with `E2E_PORT`) — a dedicated port so it
  never reuses an unrelated `pnpm dev` on 3000. Browsers install once with
  `pnpm exec playwright install chromium`.
- **Dev-auth bypass for E2E (no live WorkOS login):** the Playwright `webServer`
  blanks `WORKOS_API_KEY`/`WORKOS_CLIENT_ID`/`WORKOS_COOKIE_PASSWORD` and pins
  `NODE_ENV=development`, which forces `isDevAuthBypassActive()`
  (`src/lib/auth/config.ts`) on. Both `src/proxy.ts` and `getSessionUser`
  short-circuit to the mock `Dr. Singh` session, so journeys render the shell
  without signing in. This replaces the precursor's Clerk `__playwright` cookie.
  Do not add secrets to the E2E env — absence of creds _is_ the bypass trigger.

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

## Systematic-Review (SR) module

The SR module ships on the long-lived integration branch `feat/systematic-review`
(merges to `main` only at the founder gate), not directly to `main`.

### Schema location

- SR Drizzle schema lives under `src/lib/db/schema/`:
  - `sr-enums.ts` — all SR pgEnums (shared, no table imports → no cycle).
  - `sr.ts` — visible tables (`organizations`, `reviews`, `review_members`,
    `review_invitations`, `studies`, `ai_validations`, `workos_events`,
    `audit_log`) + re-exports the enums and the blinded tables.
  - `sr-blinded.ts` — the **three blinded base tables**: `screening_decisions`,
    `extraction_entries`, `rob_assessments`.
- The single barrel line `export * from './schema/sr'` in `src/lib/db/schema.ts`
  wires SR into the drizzle client + drizzle-kit. `users` is unchanged (internal
  `uuid` PK + `workos_user_id` unique, founder-locked); `review_members.userId`
  FKs `users.id`.
- Migrations: `0001_late_viper.sql` (additive tables) and
  `0002_sr_privilege_wall.sql` (the two-role wall, authored as a drizzle-kit
  `--custom` migration so the journal/snapshot stay consistent).

### The blinding privilege-wall invariant (science- + security-critical)

- Two Postgres roles: **`slate_migrator`** (DDL/definer, retains SELECT on the
  blinded tables, owns the reader functions) and **`slate_runtime`** (the app —
  has INSERT/UPDATE but **NO SELECT** on the three blinded tables). A stray
  Drizzle SELECT from the runtime role fails at the DB with `permission denied`.
- The only read path is the audited `SECURITY DEFINER` functions
  `public.sr_read_{screening_decisions,extraction_entries,rob_assessments}(uuid)`
  (search_path pinned to `pg_catalog`). The blinding chokepoint (T2, future
  `src/lib/sr/authz/**`) is their only intended caller; aggregates are blinded
  data and must be computed inside the chokepoint.
- **Founder step:** applying to live Neon requires provisioning the two roles via
  the Neon console/API and pointing the runtime `DATABASE_URL` at `slate_runtime`.
  The migration's role-creation `DO` blocks no-op if the roles already exist.
- Acceptance test: `pnpm test:blinded-wall` (`scripts/test-blinded-wall.sh`)
  stands up a throwaway local Postgres (no Docker/Neon), applies 0000–0002, and
  proves runtime `SELECT`/`COUNT` on each blinded table is denied while the
  definer path reads. Needs the `postgresql@16` binaries (auto-detected).

### Guard mechanism (later crewmates physically cannot regress the wall)

Three layers keep the blinded tables from being read outside `src/lib/sr/authz/**`:

1. **ESLint** `no-restricted-imports` (`eslint.config.mjs`) forbids importing
   `screeningDecisions`/`extractionEntries`/`robAssessments` outside the schema
   definition and `src/lib/sr/authz/**`.
2. **CI grep** `pnpm check:blinded-wall` (`scripts/check-blinded-wall.mjs`, run by
   `.github/workflows/blinded-wall.yml`) fails the build if any blinded table
   symbol or DB name appears outside those two locations.
3. **CODEOWNERS** (`.github/CODEOWNERS`) reserves `sr-blinded.ts`,
   `src/lib/sr/authz/**`, and the wall migration/scripts.

### Authorization contract (T3 — `src/lib/sr/authz/require-member.ts`)

Every SR handler (server component, server action, route) MUST start by resolving
access here. Per-review roles are **NEVER** read from the JWT — always a live
`review_members` lookup. Deny-by-default; the entrypoints throw typed
`SrAuthzError`s carrying the HTTP status a route boundary should return.

- `requireMember(reviewId)` → `MemberContext { userId, member, sessionUser }`.
  Resolves session → internal `users.id` → the **active** `review_members` row.
  A non-member, an unprovisioned user, and a nonexistent review are
  **indistinguishable** — all raise `ReviewAccessError` (404), never leaking
  existence (IDOR kill). `pending`/`inactive` members are not active → deny. Gate
  on `ctx.member.role`; do not trust any JWT role.
- `requireStudyInReview({ reviewId, studyId })` → the study, joined through
  `studies.reviewId = reviewId`. A study in another review 404s identically to a
  nonexistent one. **Never fetch a study by `studyId` alone** — always scope it to
  the review the caller was authorized for.
- `requireOrgScope(reviewId)` — org-admin actions only: asserts the caller's
  **active WorkOS org** (`withAuth().organizationId`) owns `reviews.orgId`, else
  `OrgScopeError` (403). Review _membership_ is org-independent and must NOT call
  this. Skipped under dev bypass (no WorkOS org context).
- `assertArbitratorIndependent({ reviewId, studyId, userId })` — server-enforced
  arbitrator independence: refuses (`ArbitratorIndependenceError`, 422) to make a
  user the arbitrator of a study they screened/extracted/appraised. Call it
  BEFORE writing the assignment. It reads participation ONLY through the audited
  `sr_read_*` definer functions and discloses just a boolean about the assignee —
  no co-reviewer data. This is the one authz path that touches blinded data, and
  it lives inside the wall-allowed `src/lib/sr/authz/**`.
- **Errors → HTTP:** `ReviewAccessError` 404 · `OrgScopeError` 403 ·
  `ArbitratorIndependenceError` 422 (all `instanceof SrAuthzError`, `.status`).
- **Tests:** `require-member.test.ts` (Vitest) fakes the DB at the `getDb()`
  boundary — runs once T5's harness lands. Test files are excluded from the
  production `tsconfig.json` so `pnpm typecheck`/`pnpm build` stay green before
  the runner exists.

- Add durable project-specific notes here as they are discovered through real work.
