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
  (search_path pinned to `pg_catalog`). The blinding chokepoint
  (`src/lib/sr/authz/**`) is their only intended caller; aggregates are blinded
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

### The blinding chokepoint contract (T2 — `src/lib/sr/authz/`)

The chokepoint is the app-layer policy brain sitting behind the DB wall. It is
the **only** module that calls the definer reader functions, and it never lets a
raw or aggregated blinded value out except through deny-by-default policy.

- `policy.ts` — the **pure** decision brain (no DB). Exhaustively unit-testable.
  - `resolveRowVisibility(role, phase)` → `'none' | 'own' | 'all'`. The matrix:
    during `independent` every authoring role (owner/collaborator/reviewer/
    arbitrator) sees `own` rows only and `viewer` sees `none` — **no role ever
    gets `all` while independent**, so a co-reviewer's row can never surface
    (owner/arbitrator get no peek). At `reconcile` those roles get `all`;
    `viewer` still gets `none` (it reads derived consensus, not raw rows).
    Anything unmatched (unknown role/phase) → `none`.
  - `resolveAggregateVisibility(role, phase)` → aggregates are blinded data, so a
    count/distribution is permitted **only when full rows are** (never during
    `independent`).
  - `computeSurfaceProgress` / `BlindedAccessError` / `applyRowVisibility`.
- `blinded-read.ts` — the DB wiring + public API. It reads the per-surface phase
  from `reviews` itself (a caller can never spoof "we're in reconcile"), calls
  the definer function, then applies policy. A denied read **throws
  `BlindedAccessError`** (never a silently-empty result). Public surface:
  `getScreeningDecisions` / `getExtractionEntries` / `getRobAssessments`,
  `getScreeningTally` (reconcile-gated aggregate), and **`getSafeProgress(reviewId)`**.
- **`getSafeProgress` is the ONLY progress surface during `independent`**:
  completion counts only (`{ finishedReviewers, totalReviewers }` per surface) —
  no decision distribution, no conflict count, no per-study/partner status.
- Callers pass a `BlindedContext { reviewId, requesterId, role }` where `role` is
  the **live `review_members` role** resolved by the authorization layer (T3),
  never a JWT claim. Every new count/PRISMA/conflict number MUST be computed
  inside this module — no `COUNT(*)` on the blinded tables lives anywhere else.
- Tests: `policy.test.ts` (exhaustive `role × phase` matrix + progress shape) and
  `blinded-read.test.ts` (per-table matrix with a mocked DB, aggregate gating,
  safe-progress leak checks). They import `vitest` and carry `@ts-nocheck` so
  `tsc` stays green until T5's harness installs the runner — do not add a runner.

### WorkOS → Neon mirror sync (T4)

Keeps SR tenancy (`users`, `organizations`, `review_members` access) in step with
WorkOS identity/orgs. Contract source: `FOUNDATION-auth-tenancy.md` §4.

- **Webhook route:** `src/app/api/sr/webhooks/workos/route.ts` (SR's own API
  namespace — never under the reserved `/api/search/**`). It verifies the WorkOS
  signature **first**, before any DB work, via the SDK's built-in verifier
  `workos.webhooks.constructEvent({ payload, sigHeader, secret })`
  (`@workos-inc/node`, added as a direct dep; verified against v10.7.0 — the
  param is `sigHeader`, not `signature`). Bad/missing signature → **401**;
  processing failure → **500** (WorkOS retries; every mirror write is idempotent).
  Needs `WORKOS_API_KEY` + `WORKOS_WEBHOOK_SECRET` (see `.env.example`).
- **Sync core** lives in `src/lib/sr/sync/`: `workos.ts` (SDK boundary +
  `normalizeEvent`), `process-event.ts` (ledger + dispatch, SDK-free & unit-
  testable), `store.ts` (the `SyncStore` port) + `drizzle-store.ts` (neon-http
  impl). The core depends only on the port, so tests use an in-memory fake — no
  DB or network. neon-http has no interactive transactions, so every write is a
  single idempotent statement.
- **Events handled:** `user.created/updated/deleted`,
  `organization.created/updated/deleted`,
  `organization_membership.created/updated/deleted`, `role.*`.
  - `user.created/updated` → idempotent `users` mirror upsert.
  - `user.deleted` (GDPR) → **tombstone**: anonymize PII (`email=''`, `name=null`),
    set `users.deleted_at`, keep the row (scientific-record FKs stay valid),
    inactivate the user's `review_members` rows. Scientific records are **never**
    cascade-deleted (runtime also has no DELETE path to them).
  - `organization.created/updated` → `organizations` mirror upsert.
    `organization.deleted` → retained (reviews FK it); ledgered only.
  - `organization_membership.deleted` → **inactivate** the user's access to that
    org's reviews (`review_members.status='inactive'`). `created/updated` are
    ledgered only — org membership **never auto-grants** review access; per-review
    roles are never trusted from the JWT.
  - `role.*` → ledgered only (WorkOS org roles are not mirrored).
- **Idempotency ledger** `workos_events`: `getEventState` short-circuits an
  already-processed `eventId` to a no-op (dedup). **No-resurrect**: a stale
  `user.updated` arriving after `user.deleted` is dropped — enforced in
  application code (checks `deleted_at`) and backstopped by the mirror upsert's
  `setWhere deleted_at IS NULL`.
- **Lazy-provision unchanged:** `/auth/callback` still JIT-upserts the `users`
  row from session claims (`src/app/auth/callback/route.ts`); the sync never
  blocks a request.
- **Schema note:** T4 adds one nullable column, `users.deleted_at`
  (migration `0003_flippant_hex.sql`), required for the GDPR tombstone +
  no-resurrect guard. It matches `FOUNDATION-auth-tenancy.md` §3's `users` shape;
  the founder-locked PK model is untouched.

### The adversarial blinding suite (T6 — the M1 EXIT GATE)

The blinding foundation is proven airtight by an **adversarial** suite: every
test is a genuine attack that primes the DB so a co-reviewer's row is physically
present, then proves that value cannot escape through the channel under test
during `independent`. Nine channel-classes, each with a reconcile-phase positive
control (so no assertion passes vacuously):

1. direct read · 2. aggregate/progress · 3. export · 4. full-text search ·
2. cached counters · 6. reconciliation view · 7. admin/owner preview ·
3. phase-transition window (TOCTOU) · 9. DB-privilege backstop.

- **Logic attacks (channels 1–8 + the aggregate/progress half of 2):**
  `src/lib/sr/authz/blinding-adversarial.test.ts` — attacks THROUGH the
  chokepoint public API (`getScreeningDecisions`/`getExtractionEntries`/
  `getRobAssessments`/`getScreeningTally`/`getSafeProgress`), never by importing
  the blinded tables.
- **Structural guard (channel 2 structural + channel 9 fast proxy):**
  `src/lib/sr/authz/blinding-wall-guard.test.ts` — a runtime scan asserting no
  blinded-table read path exists in `src/` outside `db/schema/**` + `sr/authz/**`,
  plus a static check that `0002_sr_privilege_wall.sql` still REVOKEs SELECT and
  grants only INSERT/UPDATE to `slate_runtime`.
- **DB-privilege proof (channel 9, real Postgres):** `pnpm test:blinded-wall`
  (`scripts/test-blinded-wall.sh`) stands up throwaway Postgres (no Docker/Neon,
  needs `postgresql@16`) and proves runtime `SELECT`/`COUNT` on each of the three
  blinded tables is denied while the SECURITY DEFINER readers return rows.

**Run it:** `pnpm test` (the Vitest suite, incl. both blinding files) **and**
`pnpm test:blinded-wall` (the DB wall). Both must be green.

**This is the M1 exit gate: no SR screen work starts until it passes.** The
suite re-runs against every ★ blinding-bearing screen (T12 screening, T15
extraction, T16 RoB) — a screen is not "done" until these side-channel attacks
pass on it. If any attack ever leaks, that is a genuine breach + invalidated
science: fix the boundary, never weaken the test.

### The SR route-group shell (M2)

The `/systematic-review` route group is the medicine-only overlay's frame —
a contextual second panel rendered INSIDE Slate's locked app shell. It never
touches the global shell/nav (anti-frankenstein); the Home-launcher wiring is a
later task.

- **Flag gate:** the whole group is gated on `NEXT_PUBLIC_ENABLE_SR`
  (`src/lib/sr/flag.ts::isSrEnabled`, read as a STATIC reference so Next inlines
  it client-side too). `"true"` = on; anything else / unset = off → the routes
  404 (unreachable, nothing about SR appears in the app). Documented in
  `.env.example`. Verified both ways in the browser.
- **Review-context layout** `src/app/(app)/systematic-review/[reviewId]/layout.tsx`
  (server): (1) flag gate → 404; (2) `requireMember` (T3) → deny→404 for a
  non-member / nonexistent review (no existence leak — infra errors are NOT
  masked as 404, only `SrAuthzError`); (3) loads the visible `reviews` row +
  study count + `getSafeProgress` (T2 chokepoint) — NEVER the blinded tables;
  (4) provides a client `SrReviewProvider` (`src/components/sr/review-context.tsx`,
  `useSrReview`) carrying ONLY safe facts (id / title / role / studyCount /
  safeProgress) and renders the stage rail. `loading.tsx` / `error.tsx` are
  Status-shimmer skins (no spinner). A layout error bubbles to the parent
  `systematic-review/error.tsx` (Next behavior); the review's `error.tsx`
  catches its page's errors.
- **Stage rail** `src/lib/sr/stage-rail.ts` (pure) + `src/components/sr/sr-stage-rail.tsx`.
  `BUILT_STAGES` is an in-file list (replaces the precursor's `enabled-stages`
  module): summary / members / protocol / import link; the M3+ funnel stages
  (screening…export) render disabled "Soon". Grow `BUILT_STAGES` as screens land.
- **SR home** `src/app/(app)/systematic-review/page.tsx` lists the caller's
  ACTIVE-member reviews (`src/lib/sr/reviews.ts`, membership-scoped, org-
  independent) or an empty state pointing to `/systematic-review/new` (the create
  wizard — a separate task; may 404 until it lands). The `[reviewId]` index
  `page.tsx` is the **Review Summary funnel home** (T11 — see below).
- **Module manifest** `src/lib/sr/manifest.ts` (`systematicReviewManifest`) — the
  stable `{ id, name, icon, entryRoute, flag }` seam a future Home launcher will
  consume. Exported, deliberately NOT wired into the global nav yet.
- **Dev seed** `src/lib/sr/dev-seed.ts` (`seedDevReview`) + `pnpm sr:seed`
  (`scripts/sr-dev-seed.ts`, via tsx). Inserts a demo org + review + owner
  (keyed on the dev-bypass mock `user_dev_mock`, so `requireMember` resolves the
  mock caller as owner) + reviewer + 3 studies as REAL rows — idempotent (fixed
  ids), refused in production. Needs a live `DATABASE_URL`; provisioning the two
  Neon privilege-wall roles is the founder step, so the seeded shell renders in
  the app only after that.

### The create-review wizard (T8 — SCREEN-SPECS §1)

`/systematic-review/new` (`src/app/(app)/systematic-review/new/`) — the 3-step
wizard the SR home links to. Flag-gated (404s when SR is off), additive, renders
in the global app shell (NOT the review-context layout — there is no reviewId
yet).

- **Steps:** ① **Info** (title, review type, staffing mode) → ② **Import**
  (informational + skippable — real import happens on the review's Import screen
  once it exists) → ③ **Team** (optional email + per-review-role invite rows).
  The wizard is a client component (`create-review-wizard.tsx`) holding all
  state; step transitions use the Orient entrance (tokens only).
- **Blind Mode is locked ON, not a toggle.** Every review is created with all
  three firewall phases (`screeningPhase`/`extractionPhase`/`robPhase`) hard-set
  to `independent` in `createReview` — there is no input that can start a review
  in `reconcile`. The wizard shows a non-interactive "Blind Mode — On" strip.
- **`reviewMode` (`two_reviewer` | `ai_co_reviewer`) is chosen here and stated
  FACTUALLY** — copy lives in `src/lib/sr/review-modes.ts`; `ai_co_reviewer`
  shows ONE informational line (AI is recall-validated + blinded like a human),
  never a rigor scold. `review-modes.test.ts` asserts the copy against a scold
  regex so the wording can't regress.
- **Persistence core** `src/lib/sr/create-review.ts` (`createReview`,
  `validateCreateReviewInput`) is UI/auth-free and unit-tested at the `getDb()`
  boundary (`create-review.test.ts`): a review + the creator's **active owner**
  `review_members` row + an `audit_log` entry, plus any Step-3 rows as **pending
  `review_invitations`** (hashed single-use token via `src/lib/sr/invitations.ts`
  — only the SHA-256 hash is stored; delivery + acceptance are a later
  Members/Team task, so they land `pending`). neon-http has no interactive
  transactions, so writes are ordered review → owner → audit → invitations.
- **Server action** `new/actions.ts` (`createReviewAction`) owns the trust
  boundary the core does not: flag gate, session → JIT-provisioned creator
  (`upsertUserFromWorkOs`), and org scope — the creator must be an **active
  member of a WorkOS org** (`getActiveOrgContext().organizationId`, else
  `OrgScopeError`). Dev-bypass attaches the review to the same demo org the seed
  uses (`org_dev_demo`). On success it `redirect()`s (outside the try) to
  `/systematic-review/[reviewId]`; validation/authz failures return an
  actionable message the wizard shows.
- **DB caveat:** end-to-end create needs a live Neon `DATABASE_URL` (the runtime
  neon-http driver can't talk to a plain local Postgres), which is a founder
  step — so the create→redirect path is proven by unit tests + build, and the
  wizard UI/skin is browser-verified under dev-bypass.

### The Members/Team screen + invitation security model (T7 · ★ security-sensitive)

The per-review Team screen (`/[reviewId]/members`) and its invitation flow. Net-new
(the precursor had only a `team-progress` readout). All state changes are
server-authoritative, owner-gated, and audited.

- **Feature module** `src/lib/sr/members/**` — grouped by feature, not type:
  - `roles.ts` (pure) — the five per-review roles, labels, capability one-liners
    (FOUNDATION §1), display order.
  - `token.ts` — invite-token minting via `node:crypto`. 256-bit random token;
    only its **SHA-256 hash** is persisted (`review_invitations.tokenHash`), never
    the token. Lookup is by hash against the UNIQUE column → non-enumerable.
  - `invitation-policy.ts` (pure) — `evaluateInviteForAccept` enforces the three
    token guarantees together: **single-use** (status must be `pending`),
    **expiring** (short TTL, `expiresAt`), **email-bound** (normalized-email match).
    Plus rate-limit + email-format decisions. Exhaustively unit-tested.
  - `errors.ts` — typed `MemberActionError`s (owner-required 403, rate-limited 429,
    last-owner 409, invitation-invalid 404/410, AI-validation-required 422, …),
    each with a `.status` for the route boundary.
  - `service.ts` — the owner-gated, audited DB operations. Reads VISIBLE tables
    only (never the three blinded base tables). Every mutation writes `audit_log`.
- **Accept is single-use WITHOUT interactive transactions.** The runtime driver is
  neon-http (the codebase invariant: "single idempotent statement", no
  `SELECT … FOR UPDATE`). `acceptInvitation` therefore enforces no-double-accept
  with an **atomic conditional UPDATE (compare-and-swap)**:
  `UPDATE … SET status='accepted' WHERE id=$ AND status='pending' AND expiresAt > now() RETURNING …`.
  The row transitions `pending → accepted` in ONE statement; two concurrent accepts
  race on that row, exactly one sees a RETURNING row, the loser sees zero and is
  refused. This is an equal-or-stronger single-accept guarantee than row locking.
  Follow-on writes (supersede prior pending invites, upsert the member active,
  audit) are idempotent + forward-only. If a future task adds a genuine multi-write
  transaction need, use `@neondatabase/serverless` `Pool` (Node 22 has native
  `WebSocket`; set `neonConfig.webSocketConstructor` for Node ≤ 21) — do NOT weaken
  the CAS gate.
- **Roles are enforced server-side.** `assertOwner(actor)` gates every mutation on
  `actor.member.role === 'owner'` (the LIVE `review_members` role from
  `requireMember`, never a client flag). A non-owner gets 403. Demoting/revoking the
  **last active owner** is refused (409) so a review is never orphaned.
- **Arbitrator independence is enforced at role assignment.** Promoting/adding a
  user to `arbitrator` calls `assertArbitratorIndependentForReview` (new, review-wide
  analog of `assertArbitratorIndependent`, added to the wall-allowed
  `src/lib/sr/authz/arbitrator.ts`) — refuses (422) if the user authored ANY
  screening/extraction/RoB row in the review, read only through the audited
  `sr_read_*` definer functions, disclosing just a boolean about the assignee.
- **Add-existing-member** (no token) attaches a user who already has a Neon `users`
  row (WorkOS org members sync in via T4) directly as `active`; **email invite**
  is for people without an account yet.
- **Invite email is a surfaced side effect, never silent.** No email provider is
  wired, so `createEmailInvitation` returns the raw token ONCE and the screen shows
  the invite link for the owner to send manually (FOUNDATION §7).
- **AI-member row** renders in the members table with **Validate / Activate**. The
  recall-validation GATE lands in M3 (T14); here Activate REFUSES (422) unless a
  passing `ai_validations` row already exists — so **AI can never screen
  unvalidated** — and Validate is a wired, audited stub pointing at the M3 flow.
- **Accept route** `src/app/api/sr/invitations/accept/route.ts` (POST, SR's own
  API namespace) + landing page `systematic-review/invite/[token]` (outside the
  `[reviewId]` layout — the invitee is not a member yet). Server actions in
  `[reviewId]/members/actions.ts` re-resolve `requireMember` (defense in depth) and
  surface known action/authz errors (owner-required, arbitrator-refused,
  rate-limited) as warnings rather than 500s.
- **Browser-verify needs live Neon** (members reads the DB via `requireMember` +
  `getReviewTeam`); the accept landing page renders without a DB. Full data path
  waits on the founder's Neon role provisioning + `pnpm sr:seed`.

### Import + dedup (T9 — `/[reviewId]/import`)

Bring references into a review and deduplicate them **reversibly**. Ported the
precursor's ledger/queue math and UI; rebuilt persistence server-side.

- **Schema (migration `0004_loose_meltdown.sql`, additive):** new
  `import_batches` table (one row per import action; `undoneAt` marks it undone
  **without deleting studies** — reversible, never a silent drop) + four columns
  on `studies`: `batch_id` (FK), `dupe_status` (`sr_dupe_status`:
  unique/auto_merged/needs_review/merged/kept), `dupe_of_study_id` (self-FK to
  the kept original), `dupe_matched_on` (jsonb `string[]`). New enums
  `sr_dupe_status` + `sr_import_target` in `sr-enums.ts`. Pre-T9 rows default to
  `unique` (stay in the pool).
- **Pure math** `src/lib/sr/import.ts` — ported `deriveImportLedger` /
  `deriveDupeQueue` (near-verbatim, retyped to a DB-fed `ImportView`) PLUS the
  duplicate DETECTION the precursor lacked: `detectDuplicates(incoming, seen)`
  matches on **DOI / source-id → auto_merged**; **title + (year | first author),
  no shared id → needs_review** (queued for a human); else unique. Confident dupes
  leave the pool; uncertain ones stay until decided. `canManageImport(role)` gates
  writes to owner/collaborator.
- **Parsers** `src/lib/sr/import-parse.ts` — pure, offline: `parseRis`,
  `parseCsv` (RFC4180-ish quoted-field splitter + header aliases), `parsePubmedIds`
  (PMID list → identifier-only stubs). Every parser reports a `skipped` count for
  malformed records — nothing is silently dropped.
- **Persistence** — the T4 store-port pattern: `import-store.ts` (the `ImportStore`
  port), `import-drizzle-store.ts` (neon-http impl, reads always reviewId-scoped),
  `import-service.ts` (orchestration; DB-free unit-testable via an in-memory fake).
  Every mutation writes an append-only `audit_log` row and is reversible:
  `importReferences` → parse/dedup/persist; `mergeDuplicate` /
  `markNotDuplicate` / `undoDedupDecision` (needs_review ⇄ merged/kept);
  `undoImport` / `restoreImport` (batch.undoneAt ⇄ null). IDOR: a foreign
  study/batch id 404s (`ReviewAccessError`) — imported from the pure `authz/errors`
  (not `require-member`, which pulls WorkOS→`next/cache` and breaks Vitest).
- **Screen** `src/components/sr/import/import-screen.tsx` (+ `.module.css`,
  tokens-only skin) is a client component fed the chokepoint-safe (non-blinded)
  study data by the server `page.tsx`; mutations call the `'use server'` actions
  in `import/actions.ts` (re-resolve `requireMember`, gate on role, `revalidatePath`).
  The AI-discovery strip is informational only (the schema's `ai` flag is ready
  for when AI import lands). Ledger line is the honest "N references · M
  duplicates · Undo"; undone imports show a reversible "Restore" row.
- **Tests:** `import.test.ts` (ledger/queue port + matcher + gate),
  `import-parse.test.ts`, `import-service.test.ts` (persist, reversible dedup +
  undo/restore, ledger counts, IDOR — in-memory fake store), and
  `import-screen.test.tsx` (skin + action wiring). Browser-verified the skin
  visually; a live route render needs the founder DB step (neon-http + seeded
  review), same as the rest of SR.

### The Protocol / eligibility-criteria screen (SR1 — T10)

The Protocol screen (`/systematic-review/[reviewId]/protocol`) is PICO +
inclusion/exclusion criteria with **lock + dated amendments** — the
methodological audit trail. Ported from the ScholarSync precursor
(`protocol-screen.tsx`, `criterion-editor.tsx`, `protocol.ts`) into the frozen
skin and rewired from the precursor's in-memory Zustand store to persisted,
versioned server actions.

- **Schema — one append-only table `protocol_versions`** (migration
  `0004_absurd_wolfpack.sql`, additive; **renumbers at integration**). Exactly
  ONE mutable draft row per review carries `version = NULL` (a partial unique
  index `protocol_versions_one_draft_idx` caps it at one); it is edited freely
  until locked. **Locking** stamps that row as `version = 1` (immutable).
  Every later edit is a dated **amendment**: a fresh row with the next version,
  a required `reason`, its author (`locked_by`), and `locked_at` — never a
  silent overwrite. Locked rows are only ever INSERTed, so the full history
  (v1 baseline + every amendment) is preserved. `pico`/`criteria` are typed
  JSONB (structural types in `src/lib/sr/protocol/types.ts`; the schema uses an
  erased `import type` so drizzle-kit stays relative-safe). The migration also
  `GRANT SELECT, INSERT, UPDATE` (no DELETE — append-only) to `slate_runtime`,
  guarded on the wall role existing (0002 creates it); new tables get NO default
  privilege, so per-table grants are required — mirror this for future tables.
- **The versioning state machine is pure + port-backed** (`src/lib/sr/protocol/`):
  `service.ts` (`loadProtocol`/`saveDraft`/`lockProtocol`/`amendProtocol`, clock
  injected) depends only on `store.ts` (`ProtocolStore` port + in-memory fake),
  so the contract is unit-tested with no DB (`service.test.ts`). `drizzle-store.ts`
  is the neon-http impl (single statements — no transactions). `saveDraft` is
  **refused once locked** (→ `ProtocolLockedError`); `amend` requires a non-empty
  reason (→ `AmendmentReasonRequiredError`); locking an empty protocol is refused
  (→ `ProtocolIncompleteError`, ≥1 criterion). Every mutation writes an
  `audit_log` row (`protocol.save_draft` / `protocol.lock` / `protocol.amend`).
- **Writes gate on role** (`roles.ts`): only `owner` + `collaborator` edit/lock/
  amend; everyone else sees it read-only. Server actions (`actions.ts`,
  `'use server'`) re-authorize via `requireMember` (defense in depth), sanitize
  the untrusted payload (`validate.ts` — never trusts the client), and return
  `{ ok:false, message }` for domain failures (infra errors reject → 500).
- Flag-gated + membership-gated by the `[reviewId]` layout (nothing new to wire);
  `protocol` is already in `BUILT_STAGES`, so the stage rail links it. Additive —
  no global shell/nav or reserved search paths touched. Tests: 207 green
  (was 174; +33 across service/constants/validate/screen).

### Review Summary — the funnel home (T11)

Screen 0, the index of a review, at `src/app/(app)/systematic-review/[reviewId]/page.tsx`.
Ported from the ScholarSync precursor's `summary/*` components, re-skinned to
tokens. It renders the per-stage funnel cards (Import → Export, in shell-rail
order, built stages link / un-built show "Soon"), the imported-study hero, and a
team-progress readout.

- **Funnel counts MUST route through the chokepoint — never a client store, never
  the blinded tables, never a `COUNT(*)` outside `src/lib/sr/authz/**`.** The
  precursor derived every count in the browser from a monolithic store holding all
  votes (the structural blinding hole); that call site is relocated. Non-blinded
  numbers (imported/total studies) come from `studies`; every blinded-derived
  number comes from the chokepoint (`getSafeProgress`, or a reconcile-gated tally).
- **Data seam:** `summary/review-summary-container.tsx` reads the safe review
  context (`useSrReview`) the `[reviewId]` layout resolved once server-side — the
  imported count from `studies` and completion progress from `getSafeProgress`
  (T2). The context carries ONLY safe facts, so the funnel can only render safe
  counts; `buildFunnelSummary` (`src/lib/sr/summary/funnel.ts`, pure) shapes them.
- **Independent-safe by construction:** during `independent` the summary shows
  **completion counts only** ("2 of 3 reviewers finished" per surface). It never
  renders the precursor's decision distribution (done/conflicts/one-vote/no-votes)
  or per-reviewer contribution rows — the safe `summary/team-progress.tsx` replaces
  the leaky one. A leak here would silently invalidate the review + breach blinding
  (report §2.2). Tests: `funnel.test.ts` (safe-model shape), `review-summary.test.tsx`
  - `review-summary-container.test.tsx` (assert no distribution/per-partner leak).

### Blind title/abstract screening (T12 · ★ server-enforced blinding, T6-gated)

The screening screen (`/[reviewId]/screening`) is the most security-critical SR
surface: the blinding is **enforced server-side**, never by the client. Two
reviewers label Include/Maybe/Exclude independently and blind; a co-reviewer's
vote and the AI's verdict/score never reach the screen during `independent`.

- **The blinding is a property of the SEAM, not the UI.** The screen's data is
  assembled by `src/lib/sr/screening/load.ts` (`buildScreeningView`): the
  authoritative phase is read server-side from `reviews.screening_phase` (never
  trusted from the client); decisions come ONLY through the read chokepoint
  (`getScreeningDecisions`) via `own-decisions.ts`, which re-filters to
  `reviewerId === requester` AND `!isAi` AND the current stage. So even at
  `reconcile` (where the chokepoint would return every row) THIS screen stays
  own-only — reconciliation is a different screen (T13). The `ScreeningViewDTO`
  shape carries no field that could hold a co-reviewer vote, an AI verdict, or an
  AI relevance score, so the client literally cannot render one.
- **The write chokepoint is `src/lib/sr/authz/screening-write.ts`** — the only
  place outside the schema that names the blinded table for a WRITE (inside the
  wall-allowed `authz/**`). It upserts the caller's OWN row via
  `onConflictDoUpdate` on the new unique index
  `screening_decisions_reviewer_study_stage_idx` (review/study/reviewer/stage —
  migration `0006`), with `setWhere lockedAt IS NULL` and **no `.returning()`**
  (the runtime role has INSERT/UPDATE but NO SELECT — RETURNING would fail).
  `reviewerId` is ALWAYS `ctx.userId` from the server action, never a client
  value, so a reviewer can only ever write their own decision. `finishOwnScreening`
  locks own rows (feeds `getSafeProgress`).
- **AI, science-safe:** the AI relevance SCORE is NEVER rendered (FOUNDATION §10).
  The AI verdict/reasoning is blinded like a human's — withheld until reconcile.
  AI ranking may only reorder the queue as a labeled, off-by-default toggle
  (`aiRanking` is a NON-blinded study-id order, `null` until the AI reviewer lands
  in T14 — ordering by the blinded AI score would be a side channel).
- **Owner unblind** (`phase.ts::unblindScreening`) is a one-way, atomic
  compare-and-swap `UPDATE reviews … WHERE screening_phase='independent'` (visible
  table → RETURNING ok), audited, cache-busted via `revalidatePath`.
- **T6-gated:** a ★ blinding-bearing screen is not done until the adversarial
  suite passes against it. The screen has its own side-channel tests
  (`screening/own-decisions.test.ts` — attack the read seam; `screening-screen.test.tsx`
  — assert the rendered DOM shows no AI score/verdict and only own decisions), and
  the T6 suite (`blinding-adversarial` + `blinding-wall-guard` + `pnpm
test:blinded-wall`) + wall guards (ESLint/grep) stay green. If a leak is ever
  found here, fix the boundary — never weaken a test.
- **Browser render needs live Neon** (`requireMember` → DB), the founder step
  (role provisioning + `pnpm sr:seed`), same as every SR screen. Skin + wiring are
  proven by the jsdom component tests + build; the route is registered under the
  flag-gated `[reviewId]` layout.

### The Conflicts / adjudication screen (T13 · ★-adjacent)

Post-unblind screening reconciliation (`/[reviewId]/conflicts`). Ported the
precursor's UI (`conflicts-screen.tsx`) + κ math (`conflicts.ts::cohensKappa`)
into the frozen skin; **rebuilt the reveal gate server-side** (the precursor
stripped opposing votes in the browser — client-trust — Slate never _sends_ them
pre-reconcile).

- **The reveal gate IS the chokepoint.** Conflicts + Cohen's κ are aggregates
  over every reviewer's calls, so they are computed inside
  `src/lib/sr/authz/blinded-read.ts::getScreeningConflicts(ctx, stage)`, gated by
  `resolveAggregateVisibility` — it throws `BlindedAccessError` during
  `independent` and for `viewer` at reconcile. The opposing calls physically do
  not leave the chokepoint pre-unblind. The page catches that throw and renders a
  blinded **"withheld"** state carrying zero conflict rows / no κ. The pure
  derivation (`src/lib/sr/conflicts/derive.ts`: `deriveScreeningConflicts` +
  ported `cohensKappa`, κ over the first two HUMAN calls, positive=include|maybe)
  takes a structural row type so it names no blinded symbol — the _math_ is pure,
  the _call site_ is the chokepoint (the §2.2 rule for all blinded aggregates).
- **Equal weight, unmissable, no auto-resolve** (non-negotiables 1/2/3): both
  opposing calls render in a symmetric grid — same `decisionCell` class, no
  `aria-selected`, no "primary"; every conflict card is fully expanded (never
  collapsed). A conflict is a study with BOTH an include and an exclude (a lone
  Maybe is tentative; AI counts as one more reviewer). Nothing resolves without an
  explicit human action + actor id — the service (`conflicts/service.ts`) refuses
  `align_on_one` without an explicit include/exclude pick (no majority/auto-vote)
  and refuses any resolution without an `actorId`. There is deliberately no code
  path anywhere that derives a resolution from the votes.
- **Resolution methods + persistence.** `align_on_one` (a human picks
  include/exclude) or `send_to_arbitrator`. New **non-blinded** table
  `screening_conflict_resolutions` (migration `0006_wealthy_devos.sql`, additive;
  renumbers at integration; per-table `GRANT SELECT,INSERT,UPDATE` to
  `slate_runtime`, no DELETE) records method + decision/arbitrator + `resolvedBy`
  (never null) + note, one active row per `(review, study, stage)` (upsert on
  re-resolution); **every** resolution also writes `audit_log` (`conflict.resolve`)
  — the full history is append-only there. Rows only exist at reconcile, so it is
  safe to be visible.
- **Server trust boundary** (`conflicts/actions.ts`): re-`requireMember`,
  `canResolveConflict(role)` (owner/collaborator/reviewer/arbitrator; viewer
  never), PROVE `reviews.screeningPhase === 'reconcile'` (else 409),
  `requireStudyInReview` (IDOR kill), and for send-to-arbitrator
  `assertArbitratorIndependent` (T3 authz — refuses 422 if the assignee reviewed
  the study, read only through the definer functions). Store port + neon-http
  impl mirror the protocol/import pattern; the service is DB-free + unit-tested.
- Additive: `conflicts` added to `BUILT_STAGES`; flag- + membership-gated by the
  `[reviewId]` layout; no global shell/nav or reserved search paths touched. The
  T6 adversarial suite gains `authz/blinding-conflicts.test.ts` (opposing rows
  primed → `getScreeningConflicts` withholds them pre-reconcile, reconcile
  positive control). Tests: 384 green (+31 across derive/service/roles/gate/screen).
  Full route render (real data) waits on the founder's Neon role provisioning +
  `pnpm sr:seed`, same as every SR screen; the skin was browser-verified.

### The AI screening reviewer + validation gate (T14 · ★ science-critical)

The AI is a **validated, blinded, non-autonomous** participant in screening. Its
safeguards (FOUNDATION §8–9) are all enforced in `src/lib/sr/ai/**`, with the one
blinded write in `src/lib/sr/authz/ai-screening-write.ts`. LLM calls go through the
**Vercel AI SDK** (`ai` v7 + `zod`), kept behind a narrow port so every safeguard
is provable against a deterministic **mock model** — no key, no network.

- **Port / adapter:** `ai/types.ts` is the `ScreeningModel` port; `ai/vercel-model.ts`
  is the ONLY file that touches the SDK (`generateObject` + a Zod `{decision, reasoning}`
  schema — **no score field is ever requested**); `ai/mock-model.ts` is the fake used
  by tests + dev. Public surface: `ai/index.ts`.
- **Recall-validation GATE (`ai/validation.ts` + `ai/recall.ts`):** the AI may NOT
  screen until it is recall-validated on the **includes** (sensitivity ≥ target,
  default **0.95**) against a human-labelled sample — recorded in `ai_validations`
  (`passed`, model, version, date, sampleSize, recall). `hasPassingValidation` is the
  gate read; `runAiScreening` throws `AiNotValidatedError` and casts nothing without a
  `passed=true` row. Recall counts an AI `exclude` on a true include as the only miss
  (a `maybe` keeps it in the pool). Concordance/agreement is deliberately NOT used
  (true-negative dominated → hides missed includes).
- **Blinded like a human:** the AI casts `is_ai=true` rows through the same chokepoint
  as any reviewer; the AI's synthetic reviewer id ≠ any human's, so its verdict +
  reasoning are hidden during `independent` and revealed only at `reconcile`. Its
  relevance **score is never produced** (not in the schema, not in the run result, not
  in the rail — `showScore` is the literal `false`). Optional labelled queue _order_ is
  the only AI signal allowed pre-reconcile.
- **Never autonomous (flag-only):** the writer only INSERTs blinded verdicts and never
  touches `studies` — the AI cannot exclude/remove a record; a human makes the exclusion
  at reconcile. Verdicts are reversible (`retractAiScreeningDecisions`) and PRISMA-counted.
- **Coverage-preserving:** the AI is a synthetic `users` row (`ensureAiReviewerUser`),
  **never a `review_members` row**, so `requiredHumanReviewers(mode)` (2 for two_reviewer,
  1 for ai_co_reviewer) and the `getSafeProgress` human denominator are untouched by it.
- **Phase-1 timing — ONE switch (`ai/config.ts` `SR_AI_PHASE1_MODE`, default
  `silent_hold`):** silent_hold runs the AI during `independent` and holds its verdict
  (blinded) until reconcile; `defer_to_phase2` is a clean no-op until reconcile. Flipping
  it is trivial and changes nothing else (founder may flip — NOTED as changeable).
- **T12 integration:** `buildAiReviewerRail` (`ai/rail.ts`, pure) is the composable rail
  hook the screening screen renders; the service + validation flow are exposed via
  `ai/index.ts`. The Team screen (T7) Activate/Validate wire to the gate (`activateAiReviewer`
  refuses without `passed=true`).
- **FOUNDER steps (like the Neon role step — build does not block on them):**
  1. **LLM provider key** — provision the Vercel AI Gateway / provider key and set
     `SR_AI_MODEL` (default `openai/gpt-4o-mini`). Without it, live screening fails at
     call time; build + tests use the mock model.
  2. **Labelled calibration sample** — recall validation needs a human-labelled sample
     from the review (source is a product/UX follow-up; the gate + flow are built + tested).
- **Tests (mocked LLM):** `ai/recall.test.ts`, `ai/validation.test.ts`,
  `ai/screen-reviewer.test.ts` (gate · never-autonomous · phase switch · coverage ·
  score-hidden), `ai/ai-blinded-integration.test.ts` (verdict withheld until reconcile via
  the real chokepoint), `ai/rail.test.ts`, `ai/vercel-model.test.ts` (adapter vs the SDK's
  MockLanguageModel), `authz/ai-screening-write.test.ts`. The T6 adversarial suite stays green.

### Two-phase data extraction — the firewall (T15 · ★ science-critical)

The extraction screen (`/[reviewId]/extraction`) is the strictest science surface:
two reviewers extract **independently and blind**, then reconcile via a symmetric
per-field picker. Same firewall as screening; the reconciliation adds a corrected
`resolveFinal` and the full resolution ladder. Feature module: `src/lib/sr/extraction/**`.

- **The firewall (the core).** Phase is `reviews.extraction_phase`
  (`independent`|`reconcile`), read SERVER-SIDE, never trusted from the client. In
  **Phase 1** the seam (`extraction/load.ts` → `own-entries.ts`) reads the caller's
  entries ONLY through the read chokepoint (`getExtractionEntries`), re-filtered to
  `reviewerId === requester` AND `!isAi` — so neither a co-reviewer's value nor the
  AI's can reach the screen before both reviewers **lock**. The DTO shape
  (`IndependentExtractionViewDTO`) carries no field that could hold partner/AI data.
  **Phase 2** appears only after the owner's one-way unblind (`phase.ts::unblindExtraction`,
  atomic CAS `independent→reconcile`, audited); the chokepoint then returns `all`
  rows and `deriveReconciliation` (pure) assembles the picker.
- **The corrected `resolveFinal` (`extraction/resolve-final.ts`) — the anti-pattern
  removed.** The precursor (`ScholarSync src/lib/sr/extraction.ts:27-31`) had a
  `kind:"ai"` branch that returned the AI value as the Final answer. That is GONE.
  `resolveFinal` does not even ACCEPT an AI argument, so **an AI value can never be
  Final** (structural guarantee). Its three kinds: `{kind:'agreed'}` (both HUMAN
  reviewers matched — **agreed ≠ AI**, value is the human value), `{kind:'resolved'}`
  (a human explicitly picked, via discuss/arbitrator), `{kind:'conflict', value:null}`
  (empty until a human acts). An `author_contact` log or an `unresolved` park is NOT
  a decided value — Final stays empty.
- **Write chokepoint** `src/lib/sr/authz/extraction-write.ts` — the only WRITE path to
  the blinded `extraction_entries` (in `authz/**`). Own-row upsert on the new unique
  index `(review,study,reviewer,field)` (migration `0008`),
  `setWhere lockedAt IS NULL`, **no `.returning()`** (runtime role has no SELECT).
  `reviewerId` is always `ctx.userId`.
- **Consensus kept SEPARATE (non-neg #8).** The reconciled value lands in a NEW
  non-blinded table `extraction_consensus` (migration `0008`; per-table
  `GRANT SELECT,INSERT,UPDATE`, no DELETE) — it **never overwrites** either reviewer's
  as-extracted `extraction_entries` row, which stay queryable/exportable forever.
  Store port + neon-http impl + service mirror the T13 pattern; the service
  (`extraction/service.ts`) is the **no-auto-resolve** state machine (every consensus
  needs an actor id) + the **resolution ladder**: `resolveExtractionField`
  (discuss/arbitrator; arbitrator satisfies `assertArbitratorIndependent`),
  `logAuthorContact` (an in-app LOG of attempt+response — **never auto-sends email**),
  `leaveUnresolved` (allowed ONLY after a recorded rationale + author-contacted y/n).
- **Four states / provenance / derived.** `reported`/`not_reported`/`na`/`unclear`
  are distinct — a blank is never a `0` (enforced in the write, the service, and the
  DTO). Provenance (report + page/table/figure) is kept per value; a non-`reported`
  state renders as a designed dashed cell, never blank. A calculated value is tagged
  `derived` with its formula, kept separate from as-reported.
- **QC sampling (non-neg #9).** `reviews.extraction_qc_sample_rate` (default **0.2**)
  deterministically samples AGREED CRITICAL fields for a source re-check (`extraction/qc.ts`).
  Header framing is **"N fields to verify,"** never "drive conflicts to 0".
- **T6-gated.** The screen has its own side-channel test
  (`extraction/own-entries.test.ts` — partner + AI rows primed, proven unreachable
  during independent) + `extraction-screen.test.tsx` (Final-empty, agreed≠AI, AI
  hidden-until-source, 4 states). The full T6 suite (`blinding-adversarial` incl.
  `getExtractionEntries` + `blinding-wall-guard` + `pnpm test:blinded-wall`) stays
  green. Full route render needs the founder Neon step, same as every SR screen.

### The Risk-of-Bias screen (T16 · ★-adjacent — same firewall as extraction)

Per-study, per-domain RoB appraisal (`/[reviewId]/risk-of-bias`), dual + independent

- blinded, then reconcile. Reuses the extraction/screening firewall wholesale;
  **zero edits to the chokepoint** (`blinded-read.ts` untouched → T6 stays green).

* **Instruments + roll-up** live in `src/lib/sr/rob/domains.ts` (pure): `ROB2_DOMAINS`
  (5) + `ROBINS_I_DOMAINS` (7), and `overallRobJudgment` **ported near-verbatim** from
  the precursor (`~/ScholarSync:src/lib/sr/rob.ts`) — High if any domain High, Low only
  if EVERY domain Low, else Some concerns (unassessed = at least Some). Slate's enum is
  `low | some | high` (precursor's `some_concerns` → `some`). `rollUpOverall` rolls up
  over the study's full instrument domain set. Per-study instrument is a new **visible**
  column `studies.rob_instrument` (enum `sr_rob_instrument`, default `rob2`).
* **The read seam is own-only + non-AI** (`rob/own-assessments.ts::getOwnRobJudgements`)
  through the chokepoint's existing `getRobAssessments` (own-only during `independent`).
  It re-filters `reviewerId === requester` AND `!isAi` — so during independent a reviewer
  sees NEITHER a co-reviewer's NOR the AI's judgement (anchoring kill). The per-study
  `overall` is rolled up over the caller's OWN rows only → provably no cross-reviewer
  aggregate escapes the firewall (no new chokepoint aggregate needed; same shape as
  screening's `hasFinishedScreening`).
* **The write chokepoint is `src/lib/sr/authz/rob-write.ts`** — the only human writer of
  `rob_assessments`. Upsert on the new unique index
  `rob_assessments_reviewer_study_domain_idx` (review/study/reviewer/domain, migration
  `0009_dazzling_sharon_ventura.sql`, additive); no `.returning()` and no DELETE (runtime
  has INSERT/UPDATE only), `setWhere lockedAt IS NULL` so a locked judgement is never
  rewritten. `reviewerId` is always the server-resolved caller. A **support-for-judgement
  quote is REQUIRED** (`rob/validate.ts`) — provenance for every domain call.
* **AI-suggest / human-confirm, never autonomous.** `src/lib/sr/authz/ai-rob-write.ts`
  writes ONLY `is_ai=true` suggestion rows (upsert, locked, no other table imported → no
  path to a final judgement); the chokepoint hides them until reconcile. `rob/ai-suggester.ts`
  is the RobotReviewer-style orchestrator (a `RobSuggestModel` port +
  `createDeterministicRobModel`, reusing `ensureAiReviewerUser`) — owner-triggered via
  `runAiRobSuggestionsAction`. At reconcile the reveal (`rob/reconcile.ts::assembleReconciliation`)
  shows every reviewer + the AI's LABELED suggestion at equal weight; the consensus starts
  empty and is written by the reconciler (owner/arbitrator) via `confirmRobJudgmentAction`
  → their own `castOwnRobJudgement` row. The AI never records the final judgement.
* **Owner unblind** (`rob/phase.ts::unblindRob`) is the same one-way atomic CAS on
  `reviews.rob_phase` as screening, audit-logged. `rob` added to `BUILT_STAGES`.
* **Tests:** `rob/domains.test.ts` (ported roll-up), `rob/own-assessments.test.ts`
  (T6-style seam attack: co-reviewer + AI withheld during independent, through the real
  chokepoint), `rob/validate.test.ts` (support-quote required), `rob/reconcile.test.ts`,
  `rob/ai-suggester.test.ts`, `authz/rob-write.test.ts`, `authz/ai-rob-write.test.ts`
  (never-autonomous: only is_ai rows, no DELETE, no final judgement). The T6 adversarial
  suite (which already covers `getRobAssessments`) stays green.
* **Known scope note:** the appraisal pool is the non-removed-duplicate study set (like
  screening), not yet filtered to screening-included studies — inclusion-gating is a
  follow-up once full-text/inclusion state is wired.

### The Report + auto-Methods screen (T18)

The report (`/[reviewId]/report`) is a GROUNDED manuscript scaffold: every
factual number is computed from the review's own records — never generated —
and carries a source chip naming the record set it derives from. Feature
module: `src/lib/sr/report/**`.

- **Grounding is structural, at three layers.** (1) Visible-table counts
  (import ledger, team roster, resolutions, consensus, `ai_validations`) are
  computed in the seam `report/load.ts`. (2) Blinded-derived aggregates —
  included/excluded counts + per-reason exclusions (`deriveScreeningOutcomes`)
  and the RoB roll-up (`deriveRobOutcomes`) — are pure math in
  `report/outcomes.ts` whose ONLY call sites are the new reconcile-gated
  chokepoint functions `getReportScreeningOutcomes` / `getReportRobOutcomes`
  (`authz/blinded-read.ts`, T13 pattern). During `independent` they throw
  `BlindedAccessError` and the view carries a `withheld` marker with ZERO
  numbers — the DTO cannot render a blinded count early. Adversarial coverage:
  `authz/blinding-report.test.ts` (extends T6; primed co-reviewer rows never
  escape; reconcile positive control). (3) The RoB roll-up never fakes a
  consensus: agreeing human reviewers → the judgement; disagreement → `mixed`;
  AI suggestion rows never contribute.
- **The auto Methods · data-collection block (PRISMA Items 8/9/10)** is
  assembled by `report/methods.ts` (pure) from RECORDED metadata only: team
  roster counts, blind-mode independence, recorded screening/extraction
  resolution-ladder counts, the author-contact log (consensus rows), the
  passing `ai_validations` row (model/version/recall/sample), QC sample rate,
  and the extraction template. Every statement carries `recorded` values;
  `methods.test.ts` mechanically asserts every number in every sentence traces
  to them. The AI line is factual (no rigor scold — review-modes rule).
- **AI drafting is prose-only, gated, and never a synthesis.**
  `report/draft.ts` orchestrates an injected `ReportDraftModel`
  (`mock-model.ts` deterministic; `vercel-model.ts` the second SDK adapter
  beside `ai/vercel-model.ts`, AI SDK v7 `generateObject` + `instructions` —
  the v7 rename of `system`). Structural guarantees: `DRAFTABLE_SECTIONS` is
  the closed allowlist (`abstract`/`findings`) — a model-emitted
  conclusions/GRADE section is DROPPED and counted (no auto-synthesis path
  exists); every sentence must cite ≥1 key from the closed grounding table
  (`report/grounding.ts`) and may carry no number its cited sources don't
  support (`extractNumericTokens` — digits glued to letters like "SGLT2" are
  identifiers, not numeric claims). Drops are surfaced in the UI, never
  silent. Withheld sections contribute no grounding source, so a draft
  physically cannot cite blinded data. The server action
  (`report/actions.ts`) rebuilds the grounding table server-side — the client
  never supplies the facts.
- **Screen** `components/sr/report/report-screen.tsx`: AI sections are
  labeled (`AI · drafted from your recorded data — review & edit`) and land in
  editable textareas; **Conclusions & certainty is human-only** ("Yours to
  write" — no draft path into it, enforced by the `DraftableSectionId` union).
  Withheld sections render a lock note. Edits are client-state only —
  persisting report drafts is a follow-up (T19 export is the output lane).
- **Founder step (unchanged from T14):** live drafting needs the AI Gateway
  provider key (`SR_AI_MODEL`); without it the draft action returns an
  actionable message. Build + all tests use the deterministic mock.
- **Known scope notes:** the report's screening summary covers the CURRENT
  `reviews.screening_stage` (full-text stage lands with its screen); the
  characteristics table shows four consensus fields (design / population /
  n / primary outcome).

* Add durable project-specific notes here as they are discovered through real work.
