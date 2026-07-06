# Explore — Academic Search Slice (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type a research question on Home, land on Explore, and see genuinely real academic papers with honest counts and honest source degradation — powered by the carried-over ScholarSync search engine.

**Architecture:** Copy the self-contained engine tree (`src/lib/search/**` + http/ai couplings + `@/types/search`) verbatim into slate; satisfy its 6 integration seams with thin slate-native barrels/stubs; copy `/api/search/unified/route.ts` verbatim with a one-line domain-glue change; build the Explore academic results surface against the frozen `SearchResponse` seam; route the Home composer into it.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, pnpm, Drizzle/Neon, WorkOS AuthKit, Vercel AI SDK (`ai` + `@ai-sdk/openai` → DeepSeek), Lucide, CSS Modules + frozen design tokens.

**Spec:** `docs/superpowers/specs/2026-07-06-explore-academic-search-slice-design.md`
**Engine source of record:** `/Users/shaileshsingh/ScholarSync` @ `final-integration` (`docs/SEARCH-BACKEND-MANIFEST.md` there).

## Global Constraints

- **Run dev with secrets:** `op-run -- pnpm dev` (Dev-vault keys inject; never paste/commit secrets). Same for typecheck-with-runtime and curl checks that hit real APIs.
- **Frozen skin (design.md §9):** Ink is the brand (~95% grayscale). Cool Slate default theme. Serif titles / DM Sans body / JetBrains Mono for all numbers. Hairline `--line` borders; no shadows/gradients. Animate `transform`/`opacity` only; honor `prefers-reduced-motion`.
- **⚠ SKIN TOKEN REALITY (slate) — overrides any `--s*` / `--r-*` / `--text-*` token names elsewhere in this plan; those DO NOT EXIST in slate's `globals.css`.** design.md defines **color, font-family, and motion** as CSS tokens; **radius, spacing, and type-size are px values/ranges** (§5/§6), not tokens. §9.6 forbids raw **hex** (use color tokens), not raw px.
  - **Color (tokens only, no hex):** `--ink`/`--ink2`/`--ink3`/`--muted`; `--paper`/`--rail`/`--line`/`--line2`/`--active`; `--accent`/`--accentbg`/`--accentln` (AI, links, source chips ONLY); `--may`/`--maybg`/`--mayln` (Amber = degraded/warning); `--exc`/`--excbg`/`--excln` (Tomato = error); `--inc`/`--con` for other states.
  - **Font:** `--serif` (titles, wt 600/700, never body), `--sans` (body/UI), `--mono` (every number/count/ID/year).
  - **Motion:** `--motion-micro/base/panel`, `--ease-out/in/inout`, `--motion-shift`, `--motion-stagger`; transform/opacity only.
  - **Spacing/radius/size = raw px** per §5: radii 6–8px controls/cards, 9–12px larger containers, 3–4px chips, 20px status pills; 1px `--line` borders; flat; result title 16px serif; body ~14px sans; section labels UPPERCASE ~11px letter-spaced `--muted`. **Mirror the existing `src/components/home/*` and `src/components/shell/*` CSS-module conventions.**
  - paper.design artboards are optional visual reference; the text specs (`docs/design/specs/*`) + `globals.css` + existing components are sufficient ground truth. Do not block on Paper MCP.
- **Honesty cornerstone:** never render a silent `0`; every count honest (`matchedTotal`); every degraded source disclosed via `sourceStatuses`.
- **Contract is frozen:** `src/types/search.ts` is copied verbatim and never forked; adapt the UI to real engine output.
- **Coding style:** one concern per file, 200–400 lines; `const` default; kebab-case files, PascalCase components; no `I`-prefixed types; comments only for non-obvious WHY.
- **Tier 1 green before every commit:** `pnpm typecheck` and `pnpm lint` (zero warnings).
- **Do NOT copy** the legacy per-source routes (`/api/search/{pubmed,openalex,...}`) or any non-search module (editor/studio/latex/library/dashboard/…).
- **Engine files stay verbatim** — never edit a file under the copied engine tree to satisfy a coupling; satisfy it with a slate barrel/stub outside the tree. The one exception is the route (`/api/search/unified/route.ts`), which is explicitly integration glue we own.

---

## Phase A — Carry the engine over

### Task A0: Bootstrap the test runner (vitest)

slate ships `typecheck` + `lint` but **no test runner**. Every TDD task below needs vitest first. Config verified against current docs (`vite-tsconfig-paths` picks up the `@/*` alias from `tsconfig.json`; jsdom for component render tests).

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (add `test` + `test:run` scripts)

**Interfaces:**
- Produces: `pnpm test:run` executes vitest once; `@/*` resolves in tests; jsdom + `@testing-library/jest-dom` matchers available.

- [ ] **Step 1: Install the test deps (pin to the source repo's vitest where possible)**

```bash
cd /Users/shaileshsingh/slate
SRC=/Users/shaileshsingh/ScholarSync
VITEST_V=$(git -C "$SRC" show final-integration:package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log((j.devDependencies||{}).vitest||(j.dependencies||{}).vitest||"latest")})')
pnpm add -D "vitest@${VITEST_V}" @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

- [ ] **Step 3: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add scripts to `package.json`**

Add to `"scripts"`: `"test": "vitest"`, `"test:run": "vitest run"`.

- [ ] **Step 5: Prove the runner works with a throwaway test**

Create `src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('vitest', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

Run: `pnpm test:run src/lib/__tests__/smoke.test.ts` → Expected: 1 passed. Then delete the smoke test.

- [ ] **Step 6: Ensure lint/tsc ignore vitest config appropriately, then commit**

Run `pnpm typecheck && pnpm lint` (add `vitest.config.ts`/`vitest.setup.ts` to eslint ignores only if they trip the `next` config). Commit:

```bash
git add package.json pnpm-lock.yaml vitest.config.ts vitest.setup.ts
git commit -m "build(test): add vitest (jsdom + tsconfig paths + testing-library)"
```

*(All test steps below use `pnpm test:run <path>`; where the plan says `pnpm vitest run`, treat it as `pnpm test:run`.)*

---

### Task A1: Copy the engine tree + couplings + types verbatim

**Files:**
- Create (copied from `ScholarSync@final-integration`): `src/lib/search/**` (whole tree), `src/lib/http/{circuit-breaker,outbound-limiter,resilient-fetch}.ts`, `src/lib/ai/{models.ts,query-augment.ts}`, `src/types/search.ts`
- Also copy (Tier-2, unwired this slice but part of the tree): `src/lib/youtube/study-notes.ts`, `src/app/api/youtube/summary/route.ts`, `src/components/video/VideoReadingRoom.tsx` — copy `study-notes.ts` only if imported by the search tree; otherwise defer. (Verify in Step 3.)

**Interfaces:**
- Produces: the entire engine module graph rooted at `@/lib/search/run-search` (`runLiteratureSearch`), `@/lib/search/web/federate`, `@/lib/ai/query-augment` (`augmentQuery`), and `@/types/search` (`SearchResponse`, `UnifiedSearchResult`, `SourceStatus`).

- [ ] **Step 1: Copy the engine tree from the source repo into slate**

Run (from `/Users/shaileshsingh/slate`):

```bash
SRC=/Users/shaileshsingh/ScholarSync
WT=$(mktemp -d)
git -C "$SRC" worktree add --detach "$WT" final-integration
mkdir -p src/lib/search src/lib/http src/lib/ai src/types
cp -R "$WT/src/lib/search/." src/lib/search/
cp "$WT/src/lib/http/circuit-breaker.ts" "$WT/src/lib/http/outbound-limiter.ts" "$WT/src/lib/http/resilient-fetch.ts" src/lib/http/
cp "$WT/src/lib/ai/models.ts" "$WT/src/lib/ai/query-augment.ts" src/lib/ai/
cp "$WT/src/types/search.ts" src/types/
git -C "$SRC" worktree remove --force "$WT"
```

- [ ] **Step 2: Verify the copy landed and count files**

Run:

```bash
find src/lib/search -type f | wc -l      # expect ~187
ls src/lib/search/run-search.ts src/lib/search/web/federate.ts src/lib/ai/models.ts src/types/search.ts
```

Expected: ~187 files; all four paths exist.

- [ ] **Step 3: Enumerate every out-of-tree glue import the copied code needs (the seam census)**

Run:

```bash
grep -rhoE "from \"@/lib/(db|auth|actions/[a-z-]+|logger|langfuse|rate-limit|redis|analytics|posthog|env)\"" src/lib/search src/lib/ai src/lib/http | sort -u
```

Expected seams (Task A2 provides each): `@/lib/auth`, `@/lib/db`, `@/lib/actions/scopes`, `@/lib/actions/domain-preferences`, `@/lib/logger`, `@/lib/langfuse`. If any **other** specifier appears (e.g. `@/lib/redis`, `@/lib/analytics`), STOP and add a matching stub to Task A2 before proceeding — do not edit the engine file.

- [ ] **Step 4: Commit the verbatim engine**

```bash
git add src/lib/search src/lib/http src/lib/ai src/types/search.ts
git commit -m "feat(search): carry over search engine tree + http/ai couplings + types

Verbatim from ScholarSync@final-integration. Self-contained per the backend
manifest; integration seams satisfied by slate-native glue in the next commit."
```

---

### Task A2: Slate-native integration glue (barrels + stubs)

**Files:**
- Create: `src/lib/auth/index.ts` (barrel → `getCurrentUserId`)
- Create: `src/lib/db/index.ts` (barrel → lazy `db`)
- Create: `src/lib/logger.ts` (copy verbatim — self-contained console logger)
- Create: `src/lib/langfuse.ts` (no-op stub)
- Create: `src/lib/actions/scopes.ts` (stub)
- Create: `src/lib/actions/domain-preferences.ts` (stub)
- Create: `src/lib/rate-limit.ts` (copy verbatim — already in-memory-first)
- Test: `src/lib/auth/__tests__/get-current-user-id.test.ts`, `src/lib/actions/__tests__/stubs.test.ts`

**Interfaces:**
- Produces:
  - `getCurrentUserId(): Promise<string>` (from `@/lib/auth`)
  - `db` (from `@/lib/db`) — lazy Drizzle instance; `.execute(sql)` shape unused at runtime this slice (route uses `getDomainConfig("medicine")`), present only so `domains/user-domain.ts` typechecks
  - `logger` with `.info/.warn/.error` and `.withRequestId(id?) → { info, warn, error }` (from `@/lib/logger`)
  - `getLangfuse(): unknown`, `isLangfuseConfigured(): boolean` (from `@/lib/langfuse`)
  - `getUserScopes(): Promise<ScopeRecord[]>` + `interface ScopeRecord { id: number; name: string; includedDomains: string[]; excludedDomains: string[]; includedKeywords: string[]; excludedKeywords: string[] }` (from `@/lib/actions/scopes`)
  - `getDomainPreferences(): Promise<DomainPreferenceRecord[]>` + `type DomainPreferenceLevel = "mute"|"lower"|"higher"|"prefer"`, `interface DomainPreferenceRecord { domain: string; level: DomainPreferenceLevel }` (from `@/lib/actions/domain-preferences`)
  - `checkRateLimit(userId: string, action: string, config: { limit: number; windowSeconds: number }): Promise<NextResponse | null>` + `RATE_LIMITS` (from `@/lib/rate-limit`)
- Consumes: `getSessionUser()` from `@/lib/auth/session` (existing); `getDb` from `@/lib/db/client` (existing).

- [ ] **Step 1: Write the failing test for `getCurrentUserId`**

Create `src/lib/auth/__tests__/get-current-user-id.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(async () => ({
    workosUserId: 'user_abc',
    email: 'a@b.c',
    name: 'Dr. Test',
    avatarUrl: null,
    isMock: true,
  })),
}));

import { getCurrentUserId } from '@/lib/auth';

describe('getCurrentUserId', () => {
  it('returns the WorkOS user id from the session', async () => {
    await expect(getCurrentUserId()).resolves.toBe('user_abc');
  });
});
```

- [ ] **Step 2: Run it — verify it fails (module not found)**

Run: `pnpm vitest run src/lib/auth/__tests__/get-current-user-id.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Write the auth barrel**

Create `src/lib/auth/index.ts`:

```ts
import { getSessionUser } from './session';

/**
 * The engine and the unified route identify the caller by a stable user id.
 * In slate that is the WorkOS user id (the dev-mock id outside production).
 */
export async function getCurrentUserId(): Promise<string> {
  return (await getSessionUser()).workosUserId;
}

export { getSessionUser } from './session';
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm vitest run src/lib/auth/__tests__/get-current-user-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the db barrel (lazy — never throws at import)**

Create `src/lib/db/index.ts`:

```ts
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { getDb } from './client';
import * as schema from './schema';

export { getDb } from './client';
export { schema };

/**
 * Lazy db handle for engine modules that import `{ db }` (e.g.
 * search/domains/user-domain.ts). The connection is created on first property
 * access, so importing this barrel never throws when DATABASE_URL is unset.
 * Slice 1 does not exercise this path at runtime (the route defaults the domain).
 */
export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_target, prop) {
      return Reflect.get(getDb() as object, prop);
    },
  },
);
```

- [ ] **Step 6: Copy the logger verbatim from the source repo**

Run:

```bash
SRC=/Users/shaileshsingh/ScholarSync
git -C "$SRC" show final-integration:src/lib/logger.ts > src/lib/logger.ts
grep -c "withRequestId" src/lib/logger.ts   # expect >= 1
```

If the copied `logger.ts` imports anything outside stdlib (`grep -E "^import" src/lib/logger.ts`), replace those with console equivalents so it stays self-contained.

- [ ] **Step 7: Write the langfuse no-op stub**

Create `src/lib/langfuse.ts`:

```ts
/**
 * No-op tracing stub. Real Langfuse is a Later concern. `isLangfuseConfigured()`
 * returns false, so `getLangfuse()` is never invoked on the traced path — but it
 * must exist and typecheck because `@/lib/ai/models.ts` imports both.
 */
type NoopGeneration = { end: (..._args: unknown[]) => void };
type NoopTrace = { generation: (..._args: unknown[]) => NoopGeneration };
type NoopLangfuse = { trace: (..._args: unknown[]) => NoopTrace };

export function isLangfuseConfigured(): boolean {
  return false;
}

export function getLangfuse(): NoopLangfuse {
  const generation: NoopGeneration = { end: () => {} };
  const trace: NoopTrace = { generation: () => generation };
  return { trace: () => trace };
}
```

Verify `models.ts` only imports `{ getLangfuse, isLangfuseConfigured }` from `@/lib/langfuse` (`grep langfuse src/lib/ai/models.ts`). If it imports a `Langfuse` **type**, add `export type Langfuse = NoopLangfuse;`.

- [ ] **Step 8: Write the scopes + domain-preferences stubs with tests**

Create `src/lib/actions/scopes.ts`:

```ts
export interface ScopeRecord {
  id: number;
  name: string;
  includedDomains: string[];
  excludedDomains: string[];
  includedKeywords: string[];
  excludedKeywords: string[];
}

/** Slice 1: no user-defined scopes yet. The scopes table lands in a later slice. */
export async function getUserScopes(): Promise<ScopeRecord[]> {
  return [];
}
```

Create `src/lib/actions/domain-preferences.ts`:

```ts
export type DomainPreferenceLevel = 'mute' | 'lower' | 'higher' | 'prefer';

export interface DomainPreferenceRecord {
  domain: string;
  level: DomainPreferenceLevel;
}

/** Slice 1: neutral — no per-user domain weighting yet. */
export async function getDomainPreferences(): Promise<DomainPreferenceRecord[]> {
  return [];
}
```

Create `src/lib/actions/__tests__/stubs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getUserScopes } from '@/lib/actions/scopes';
import { getDomainPreferences } from '@/lib/actions/domain-preferences';

describe('slice-1 action stubs', () => {
  it('getUserScopes returns an empty list', async () => {
    await expect(getUserScopes()).resolves.toEqual([]);
  });
  it('getDomainPreferences returns an empty list', async () => {
    await expect(getDomainPreferences()).resolves.toEqual([]);
  });
});
```

Run: `pnpm vitest run src/lib/actions/__tests__/stubs.test.ts` → Expected: PASS.

- [ ] **Step 9: Copy the rate limiter verbatim (in-memory-first already)**

Run:

```bash
SRC=/Users/shaileshsingh/ScholarSync
git -C "$SRC" show final-integration:src/lib/rate-limit.ts > src/lib/rate-limit.ts
grep -E "export (async )?(function|const) (checkRateLimit|RATE_LIMITS)" src/lib/rate-limit.ts
```

Expected: both `checkRateLimit` and `RATE_LIMITS` exported. If the file imports `@/lib/logger` or `next/server`, both resolve in slate — leave verbatim. If it imports `@upstash/ratelimit`/`@upstash/redis` at top level (not lazy `require`), convert those to a lazy `require` inside the `if (UPSTASH...)` branch so the module loads without the dep installed.

- [ ] **Step 10: Commit the glue**

```bash
git add src/lib/auth/index.ts src/lib/db/index.ts src/lib/logger.ts src/lib/langfuse.ts src/lib/actions src/lib/rate-limit.ts src/lib/auth/__tests__ src/lib/actions/__tests__
git commit -m "feat(search): slate-native integration glue for the engine

auth/db barrels, console logger, no-op langfuse, empty scopes/domain-prefs
stubs, and the in-memory-first rate limiter. Engine files stay verbatim."
```

---

### Task A3: Resolve the dependency closure (typecheck is the oracle)

**Files:**
- Modify: `package.json` (add only the engine's runtime deps), `src/lib/rate-limit.ts` / others only if a top-level dep import must become lazy.

**Interfaces:**
- Produces: a clean `pnpm typecheck` across `src/lib/search`, `src/lib/http`, `src/lib/ai`, and the glue — with the route not yet added.

- [ ] **Step 1: First typecheck pass — collect missing modules**

Run: `pnpm typecheck 2>&1 | grep -E "Cannot find module|Could not find a declaration" | sort -u`
Expected: a list like `ai`, `@ai-sdk/openai`, `zod`, possibly `fast-xml-parser`, `@upstash/redis`.

- [ ] **Step 2: Add exactly those runtime deps (pinned), nothing legacy**

For each reported package, confirm it is imported by a file on the **academic or shared** path (not an editor/studio remnant) before adding. Then, matching the source repo's versions:

```bash
SRC=/Users/shaileshsingh/ScholarSync
git -C "$SRC" show final-integration:package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const want=process.argv.slice(1);console.log(want.map(p=>`${p}@${(j.dependencies||{})[p]||(j.devDependencies||{})[p]||"latest"}`).join(" "))})' ai @ai-sdk/openai zod fast-xml-parser @upstash/redis
```

Install the printed `pkg@version` list with `pnpm add`. Re-run Step 1. Repeat until no "Cannot find module" remains. Verify current API usage against docs before assuming a signature (`npx ctx7@latest ...`) if any type error looks like an API-shape mismatch rather than a missing dep.

- [ ] **Step 3: Resolve residual type errors**

Run: `pnpm typecheck 2>&1 | grep -vE "route.ts" | head -40`
Fix by: (a) adding `@types/*` dev deps for JS-only packages; (b) converting a top-level optional-dep import to a lazy `require` **only** in glue files we own (never engine files); (c) if an engine file references a seam missed in Task A2, add the stub. Do not weaken `tsconfig`. Do not edit engine files.

- [ ] **Step 4: Confirm green (engine + glue, pre-route)**

Run: `pnpm typecheck && pnpm lint`
Expected: zero errors, zero warnings.

- [ ] **Step 5: Commit the dependency closure**

```bash
git add package.json pnpm-lock.yaml src/lib
git commit -m "build(search): install the engine's runtime dependency closure

Only the academic/shared-path deps the copied tree imports; verified via
typecheck. No legacy editor/studio dependencies."
```

---

## Phase B — Wire the academic route

### Task B1: Add `/api/search/unified` (verbatim + one-line domain glue)

**Files:**
- Create: `src/app/api/search/unified/route.ts` (copied verbatim, one change)
- Test: `src/app/api/search/unified/__tests__/route.contract.test.ts`

**Interfaces:**
- Consumes: `runLiteratureSearch` (`@/lib/search/run-search`), `augmentQuery` (`@/lib/ai/query-augment`), `getCurrentUserId`/`checkRateLimit`/`RATE_LIMITS`/`logger`/`getUserScopes`/`getDomainPreferences` (glue), `getDomainConfig` (`@/lib/search/domains`).
- Produces: `GET /api/search/unified?q=&tab=academic&page=&perPage=&sort=` → `Response` with JSON body satisfying `SearchResponse` (`{ results, total, matchedTotal?, page, perPage, hasMore, sourceCounts, sourceStatuses?, augmentedQueries? }`). 401 on auth failure; 400 on missing/`>500`-char `q`; 500 `{ error: "Search failed" }` on engine throw.

- [ ] **Step 1: Copy the route verbatim from the source repo**

```bash
SRC=/Users/shaileshsingh/ScholarSync
mkdir -p src/app/api/search/unified
git -C "$SRC" show final-integration:src/app/api/search/unified/route.ts > src/app/api/search/unified/route.ts
```

- [ ] **Step 2: Apply the single domain-glue change (avoid the unwired DB path)**

In `src/app/api/search/unified/route.ts`, replace the per-user domain lookup with the default domain (the engine file's own fallback), so Slice 1 never touches the not-yet-created domain-preference table.

Find:

```ts
    const requestedDomainId = searchParams.get("domain");
    const domain = requestedDomainId
      ? getDomainConfig(requestedDomainId)
      : await getCurrentUserDomainConfig(userId);
```

Replace with:

```ts
    const requestedDomainId = searchParams.get("domain");
    // Slice 1: default the domain (medicine). Per-user domain preferences arrive
    // with the domain-preferences table in a later slice.
    const domain = getDomainConfig(requestedDomainId ?? "medicine");
```

Then remove the now-unused `getCurrentUserDomainConfig` import line. Run `pnpm typecheck` and confirm no "unused import" / lint error remains for it.

- [ ] **Step 3: Write the contract test (mocks the engine — no network)**

Create `src/app/api/search/unified/__tests__/route.contract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'user_test') }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { search: { limit: 100, windowSeconds: 60 } },
}));
vi.mock('@/lib/ai/query-augment', () => ({ augmentQuery: vi.fn(async () => ({ pubmedQuery: 'p', semanticScholarQuery: 's', openAlexQuery: 'o', suggestedFilters: {} })) }));
vi.mock('@/lib/search/run-search', () => ({
  runLiteratureSearch: vi.fn(async () => ({
    results: [{ title: 'A trial', authors: ['X'], journal: 'JAMA', year: 2024, citationCount: 10, publicationTypes: [], sources: ['pubmed'], isOpenAccess: true }],
    total: 1, matchedTotal: 142, page: 0, perPage: 20,
    sourceCounts: { pubmed: 1 }, sourceStatuses: { pubmed: { source: 'pubmed', status: 'ok' } }, confidence: { level: 'high' },
  })),
}));

import { GET } from '@/app/api/search/unified/route';

const call = (qs: string) => GET(new Request(`http://t/api/search/unified?${qs}`));

describe('GET /api/search/unified (academic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a SearchResponse with honest matchedTotal', async () => {
    const res = await call('q=SGLT2%20in%20HFpEF&tab=academic');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matchedTotal).toBe(142);
    expect(body.sourceStatuses.pubmed.status).toBe('ok');
    expect(body.results[0].title).toBe('A trial');
  });

  it('400s when q is missing', async () => {
    expect((await call('tab=academic')).status).toBe(400);
  });

  it('400s when q exceeds 500 chars', async () => {
    expect((await call(`q=${'a'.repeat(501)}`)).status).toBe(400);
  });
});
```

- [ ] **Step 4: Run the contract test**

Run: `pnpm vitest run src/app/api/search/unified/__tests__/route.contract.test.ts`
Expected: PASS (all 3). If the auth 401 path or param parsing differs, fix the glue/mocks — not the route body.

- [ ] **Step 5: Real end-to-end smoke against live databases**

Run (real keys; expect ~8–12s):

```bash
op-run -- pnpm dev &
sleep 6
curl -s "http://localhost:3000/api/search/unified?q=SGLT2%20inhibitors%20in%20HFpEF&tab=academic&perPage=5" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("results:",j.results?.length,"matchedTotal:",j.matchedTotal,"sources:",Object.keys(j.sourceCounts||{}),"statuses:",j.sourceStatuses)})'
kill %1
```

Expected: `results` > 0, a real `matchedTotal`, ≥1 academic source in `sourceCounts`, `sourceStatuses` present. If a source shows a non-`ok` status that's honest degradation (fine). If the whole thing is empty, check that dev ran under `op-run` (keys present).

- [ ] **Step 6: Commit the route**

```bash
git add src/app/api/search/unified
git commit -m "feat(search): wire /api/search/unified to slate auth/db/rate-limit

Route copied verbatim; only the per-user domain lookup is defaulted for the
slice. Real academic fan-out verified end-to-end under op-run."
```

---

## Phase C — Explore academic results surface

> Visual rule for every Task in this phase: before writing JSX/CSS, screenshot the matching paper.design artboard (`mcp__plugin_paper-desktop_paper__*` — `Explore / Desktop / Academic — {Populated,Loading,No results,Source-degraded,Error}`) and read the referenced tokens from `src/app/globals.css`. Build to match. Never invent a visual value (design.md §9). Reuse the existing shell — Explore renders inside `(app)/layout.tsx` unchanged.

### Task C1: Explore route + page shell

**Files:**
- Create: `src/app/(app)/explore/page.tsx`
- Create: `src/app/(app)/explore/explore.module.css`

**Interfaces:**
- Consumes: `searchParams` `{ q?: string }`.
- Produces: renders `<ExplorePageClient initialQuery={q} />` inside a top-aligned, scrolling main column. Topbar page label = `Explore`.

- [ ] **Step 1: Write the page (server component)**

Create `src/app/(app)/explore/page.tsx`:

```tsx
import { ExplorePageClient } from '@/components/explore/explore-page-client';
import styles from './explore.module.css';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className={styles.explore}>
      <ExplorePageClient initialQuery={q ?? ''} />
    </div>
  );
}
```

- [ ] **Step 2: Write the layout CSS (top-aligned scroll; tokens only)**

Create `src/app/(app)/explore/explore.module.css` — a top-aligned column (contrast with Home's centered layout), max content width and horizontal padding pulled from the paper artboard + globals tokens (e.g. `--s*` spacing scale). No invented values.

- [ ] **Step 3: Temporary stub client so the route renders, then verify**

Create a minimal `src/components/explore/explore-page-client.tsx` returning `null` for now (Task C6 fills it). Run `pnpm typecheck` → PASS. Commit at the end of C6 (this task's file is completed by later tasks).

---

### Task C2: The search hook + honest-count mapper (pure logic, unit-tested)

**Files:**
- Create: `src/components/explore/use-unified-search.ts`
- Create: `src/components/explore/honest-count.ts`
- Test: `src/components/explore/__tests__/honest-count.test.ts`

**Interfaces:**
- Produces:
  - `honestCount(res: Pick<SearchResponse, 'matchedTotal' | 'total' | 'sourceCounts'>): string` → e.g. `142 matched across 5 sources` or `3,400 matched across 5 sources · showing the top 200 by relevance` (numerals grouped with `,`; the `· showing the top …` clause appears only when `matchedTotal > total`).
  - `type SearchState = { status: 'idle'|'loading'|'success'|'error'; data?: SearchResponse; error?: string }`
  - `useUnifiedSearch(query: string, tab: 'academic'): SearchState` — fetches `/api/search/unified?q=&tab=academic`, tracks loading/success/error, aborts stale requests.
- Consumes: `SearchResponse` from `@/types/search`.

- [ ] **Step 1: Write failing tests for `honestCount`**

Create `src/components/explore/__tests__/honest-count.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { honestCount } from '@/components/explore/honest-count';

describe('honestCount', () => {
  it('reports matched across sources when nothing is capped', () => {
    expect(honestCount({ matchedTotal: 142, total: 142, sourceCounts: { a: 100, b: 42 } }))
      .toBe('142 matched across 2 sources');
  });
  it('discloses the cap and groups numerals when matched exceeds total', () => {
    expect(honestCount({ matchedTotal: 3400, total: 200, sourceCounts: { a: 1, b: 1, c: 1, d: 1, e: 1 } }))
      .toBe('3,400 matched across 5 sources · showing the top 200 by relevance');
  });
  it('falls back to total when matchedTotal is absent', () => {
    expect(honestCount({ matchedTotal: undefined, total: 12, sourceCounts: { a: 12 } }))
      .toBe('12 matched across 1 source');
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run src/components/explore/__tests__/honest-count.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `honestCount`**

Create `src/components/explore/honest-count.ts`:

```ts
import type { SearchResponse } from '@/types/search';

const group = (n: number) => n.toLocaleString('en-US');

export function honestCount(
  res: Pick<SearchResponse, 'matchedTotal' | 'total' | 'sourceCounts'>,
): string {
  const matched = res.matchedTotal ?? res.total;
  const sources = Object.keys(res.sourceCounts).length;
  const sourceWord = sources === 1 ? 'source' : 'sources';
  const base = `${group(matched)} matched across ${sources} ${sourceWord}`;
  return matched > res.total
    ? `${base} · showing the top ${group(res.total)} by relevance`
    : base;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run src/components/explore/__tests__/honest-count.test.ts` → PASS.

- [ ] **Step 5: Implement the search hook**

Create `src/components/explore/use-unified-search.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import type { SearchResponse } from '@/types/search';

export type SearchState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: SearchResponse;
  error?: string;
};

export function useUnifiedSearch(query: string, tab: 'academic'): SearchState {
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  useEffect(() => {
    if (!query.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const url = `/api/search/unified?q=${encodeURIComponent(query)}&tab=${tab}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Search failed (${r.status})`);
        return (await r.json()) as SearchResponse;
      })
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', error: err instanceof Error ? err.message : 'Search failed' });
      });
    return () => controller.abort();
  }, [query, tab]);

  return state;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck && pnpm lint`, then:

```bash
git add src/components/explore/use-unified-search.ts src/components/explore/honest-count.ts src/components/explore/__tests__/honest-count.test.ts
git commit -m "feat(explore): unified-search hook + honest-count mapper"
```

---

### Task C3: ResultHeader + SourceStatusChip (honest degradation)

**Files:**
- Create: `src/components/explore/source-status-chip.ts` (pure mapper) + `.tsx` (view) + `.module.css`
- Create: `src/components/explore/result-header.tsx` + `.module.css`
- Test: `src/components/explore/__tests__/source-status-chip.test.ts`

**Interfaces:**
- Produces:
  - `sourceStatusModel(sourceStatuses?: Record<string, SourceStatus>, sourceCount?: number): { label: string; degraded: boolean; reasons: string[] }` — all-ok → `{ label: '5 sources', degraded: false, reasons: [] }`; any non-`ok` → `{ label: '4 of 5 sources · {Source} temporarily unavailable', degraded: true, reasons: [...] }`. Never reads a degraded source's `0` as "no results".
  - `<ResultHeader data={SearchResponse} />` — left: `honestCount` line (`--mono` numerals, `--muted`); right: `<SourceStatusChip>` + `Sources ▾`.
  - `<SourceStatusChip model={ReturnType<typeof sourceStatusModel>} />` — Amber dot (`--may`) + reason tooltip when degraded; optional Lucide `check` `--muted` when ok.
- Consumes: `SourceStatus` from `@/types/search`.

- [ ] **Step 1: Confirm the `SourceStatus` shape**

Run: `sed -n '1,40p' src/lib/search/source-status.ts` — note the `status` field's union (`ok|timeout|rate_limited|missing_config|error`) and any `source`/`reason` fields. Use those exact keys in the mapper.

- [ ] **Step 2: Write failing tests for `sourceStatusModel`**

Create `src/components/explore/__tests__/source-status-chip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sourceStatusModel } from '@/components/explore/source-status-chip';

const ok = (source: string) => ({ source, status: 'ok' as const });
const down = (source: string) => ({ source, status: 'timeout' as const });

describe('sourceStatusModel', () => {
  it('reports N sources when all ok', () => {
    const m = sourceStatusModel({ pubmed: ok('pubmed'), europepmc: ok('europepmc') }, 2);
    expect(m).toEqual({ label: '2 sources', degraded: false, reasons: [] });
  });
  it('discloses a degraded source and never hides it as zero', () => {
    const m = sourceStatusModel({ pubmed: ok('pubmed'), scopus: down('scopus') }, 2);
    expect(m.degraded).toBe(true);
    expect(m.label).toContain('1 of 2 sources');
    expect(m.reasons.join(' ')).toMatch(/scopus/i);
  });
  it('is not degraded when statuses are absent', () => {
    expect(sourceStatusModel(undefined, 5)).toEqual({ label: '5 sources', degraded: false, reasons: [] });
  });
});
```

- [ ] **Step 3: Run — verify fail; then implement the mapper**

Run the test (FAIL), then create `src/components/explore/source-status-chip.ts` with `sourceStatusModel` implementing the exact strings above (count ok vs total, list non-ok source names as reasons). Re-run → PASS.

- [ ] **Step 4: Build the views (tokens/artboard-driven)**

Create `source-status-chip.tsx` + `.module.css` and `result-header.tsx` + `.module.css`, matching the paper artboard. Honest-count uses `--mono` for numerals; degraded chip uses the Amber `--may` dot; no invented values.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/components/explore/source-status-chip.* src/components/explore/result-header.* src/components/explore/__tests__/source-status-chip.test.ts
git commit -m "feat(explore): result header + honest source-status chip"
```

---

### Task C4: TabBar (Academic active; others Beta-disabled)

**Files:**
- Create: `src/components/explore/tab-bar.tsx` + `.module.css`

**Interfaces:**
- Produces: `<TabBar active="academic" onSelect={(t) => void} />` — renders `Academic · Web · News · Discussions · Videos`. Academic: `--ink` label + 2px `--ink` underline. Web/News/Discussions/Videos: `--muted`, `disabled`, each with a small `Beta` tag; `onSelect` only fires for `academic` this slice.

- [ ] **Step 1: Build the component to the artboard**

Create `tab-bar.tsx` + `.module.css`. Non-academic tabs are `aria-disabled` and non-interactive (Slice 2 enables them). No dead-looking clickable tabs — disabled state is visually explicit.

- [ ] **Step 2: Smoke test + commit**

Add a render test asserting Academic has the active class and Web is disabled. `pnpm vitest run` → PASS. Commit `feat(explore): tab bar (academic active, others beta)`.

---

### Task C5: AcademicResultCard + badges + Cite/Open

**Files:**
- Create: `src/components/explore/academic-result-card.tsx` + `.module.css`
- Create: `src/components/explore/journal-quartile-badge.tsx` + `.module.css`
- Create: `src/components/explore/format-citation.ts` (pure) + test

**Interfaces:**
- Produces:
  - `<AcademicResultCard result={UnifiedSearchResult} />` — serif `--text-lg` title (links to `result.url`/DOI), meta `Authors · Journal · Year` (year `--mono`), badge row (`<JournalQuartileBadge>` + study-type chip from `result.studyType` + citations `result.citationCount` `--mono` with Lucide `quote`), 2-line `abstract` snippet, hover-reveal actions **Open** (external-link → `result.url`) + **Cite** (copies `formatCitation(result)`).
  - `<JournalQuartileBadge quartile={UnifiedSearchResult['journalQuartile']} />` — monochrome: Q1/Q2 `--ink` on `--rail`; Q3/Q4 `--muted`; renders nothing when null.
  - `formatCitation(r: UnifiedSearchResult): string` — `Authors (Year). Title. Journal.` (+ ` https://doi.org/{doi}` when present).
- Consumes: `UnifiedSearchResult` from `@/types/search`.

- [ ] **Step 1: Failing test for `formatCitation`**

Create the test asserting: `['Zannad F', 'Ferreira JP'], year 2020, title 'SGLT2i in HF', journal 'The Lancet', doi '10.1016/x'` → `Zannad F, Ferreira JP (2020). SGLT2i in HF. The Lancet. https://doi.org/10.1016/x`. Run → FAIL.

- [ ] **Step 2: Implement `format-citation.ts`; run → PASS.**

- [ ] **Step 3: Build the badge + card to the artboard**

`journal-quartile-badge.tsx` (monochrome tiers, `--mono` label). `academic-result-card.tsx`: hover-reveal actions follow CRAFT-ADDENDUM §A (`--motion-micro` opacity, never persistent); title 2-line clamp; snippet 2-line clamp. Only **Open** + **Cite** render this slice (Save/Add are Slice 2 — omitted, not disabled). Click-through = title link (Side-peek is Slice 2). All values from tokens/artboard.

- [ ] **Step 4: Render smoke test (badge tiers + Cite copy) + commit**

Commit `feat(explore): academic result card, quartile badge, cite/open actions`.

---

### Task C6: State components + ExplorePageClient (the state machine)

**Files:**
- Create: `src/components/explore/results-skeleton.tsx` (+css), `no-results.tsx` (+css), `source-degraded-note.tsx` (+css), `search-error.tsx` (+css)
- Modify: `src/components/explore/explore-page-client.tsx` (replace the C1 stub)
- Create: `src/components/explore/search-bar.tsx` (+css)

**Interfaces:**
- Consumes: `useUnifiedSearch`, `honestCount`, `sourceStatusModel`, `ResultHeader`, `TabBar`, `FilterPills` (C7), `AcademicResultCard`, and the four state components.
- Produces: `<ExplorePageClient initialQuery={string} />` — owns `query` (seeded from `initialQuery`, editable via `<SearchBar>`), fixed `tab='academic'`. Renders the state machine:
  - `loading` → `<ResultsSkeleton />` (Status shimmer, never a spinner)
  - `success` + results → `<ResultHeader>` + degraded note (if `sourceStatusModel(...).degraded`) + `<TabBar>` + `<FilterPills>` + list of `<AcademicResultCard>` (Continuity staggered entrance, cap ≤6)
  - `success` + empty → `<NoResults query={query} />`
  - `error` → `<SearchError query={query} onRetry={...} />`

- [ ] **Step 1: Build the four state components to their artboards**

`results-skeleton` (title bar + meta bar + 2 badge chips + 2 snippet lines as `--active`/`--line2` blocks, §8 Status shimmer). `no-results` (serif `No papers matched "{query}" in Academic.` + `--muted` body + actions `Clear filters` · `Search the Web →`). `source-degraded-note` (calm Amber `--may` strip; copy from spec §7). `search-error` (Tomato `--exc` `alert-triangle`, `Couldn't run that search`, `Try again` with `refresh-cw`, query preserved). Copy strings verbatim from `explore-search-states.md §7`.

- [ ] **Step 2: Build `search-bar.tsx`**

Editable query, Lucide `search` glyph, ⌘K affordance (visual), submit (Enter) calls `onSubmit(value)`; hairline `--line` box, `--r-lg`.

- [ ] **Step 3: Wire `ExplorePageClient` (replace the C1 stub)**

Implement the state machine above. Staggered entrance honors `prefers-reduced-motion` (instant). Degraded note reads `sourceStatusModel(data.sourceStatuses, Object.keys(data.sourceCounts).length).degraded` — a degraded source's zero count is never rendered as "no results".

- [ ] **Step 4: Typecheck, lint, then real browser verify**

Run `op-run -- pnpm dev`; open `http://localhost:3000/explore?q=SGLT2%20inhibitors%20in%20HFpEF`. Confirm: real cards, honest count line, tabs (Academic active), loading skeleton on first paint, and (nonsense query) the No-results teach-state. Commit `feat(explore): result states + explore page client state machine`.

---

### Task C7: FilterPills (inert, present)

**Files:**
- Create: `src/components/explore/filter-pills.tsx` + `.module.css`

**Interfaces:**
- Produces: `<FilterPills />` — `Scope ▾ · Sort: Relevance ▾ · Time: Any year ▾`, right-aligned, hairline chips `--r-md` with Lucide `chevron-down`, rendered **disabled** (Slice 1 does not fake filtering; Slice 2 wires them). Include in `ExplorePageClient`'s success view.

- [ ] **Step 1: Build to the artboard, disabled state explicit; add to the client; commit**

`pnpm typecheck && pnpm lint`; commit `feat(explore): filter pills (inert, slice 1)`.

---

## Phase D — Composer → Explore

### Task D1: Composer submits to Explore

**Files:**
- Modify: `src/components/home/composer.tsx`

**Interfaces:**
- Consumes: `useRouter` from `next/navigation`.
- Produces: on send (button click or Enter without Shift) with non-empty trimmed text → `router.push('/explore?q=' + encodeURIComponent(value.trim()))`. Existing typing→send-fills behaviour unchanged.

- [ ] **Step 1: Add the submit handler**

In `src/components/home/composer.tsx`, add `const router = useRouter();` and:

```tsx
function submit() {
  const q = value.trim();
  if (!q) return;
  router.push(`/explore?q=${encodeURIComponent(q)}`);
}
```

Wire the send button `onClick={submit}` and the textarea `onKeyDown` (`Enter` without `Shift` → `e.preventDefault(); submit();`).

- [ ] **Step 2: Browser verify + commit**

`op-run -- pnpm dev`; on Home type a question, press Enter → lands on `/explore?q=…` with real results. Commit `feat(home): composer submits to Explore`.

---

## Phase E — Verify & finish

### Task E1: End-to-end verification and Tier-1 gate

- [ ] **Step 1: Full flow (real app)** — `op-run -- pnpm dev`; Home → type `SGLT2 inhibitors in HFpEF` → Enter → Explore shows real papers from ≥2 sources; honest count matches `matchedTotal`; Loading skeleton seen on first paint.
- [ ] **Step 2: Degradation** — force one source down (temporarily unset its key in a scratch `op-run` env or point it at a bad host) → the Amber degraded note appears; no silent `0`.
- [ ] **Step 3: No-results + Error** — nonsense query → teach-state; stop the dev server mid-request or point the route at a throw → `SearchError`, query preserved.
- [ ] **Step 4: Tier 1** — `pnpm typecheck && pnpm lint && pnpm vitest run` all green (zero warnings).
- [ ] **Step 5: Invoke the `verify` skill** to drive the affected flow end-to-end and record the observation.
- [ ] **Step 6:** Open a PR: `feat(explore): real academic search slice`. Body: what changed (engine carry-over + Explore academic surface + composer routing), why (Slice 1 of Home/Explore), how to test (the steps above). Note Slices 2–4 as follow-ups.

---

## Self-Review

**Spec coverage:** engine placement §3 → A1; glue §4 → A2/A3 + B1 domain change; seam census catches stragglers → A1.S3. Explore anatomy §1/§5 → C1–C7; honest count §3 → C2; source-status/degraded §3/§7 → C3/C6; tabs+Beta §1/§3 → C4; academic card §2 → C5; states §4 (Populated/Loading/No-results/Degraded/Error) → C6; filters inert §5 → C7; composer submit → D1; verification §8 → E1. Non-goals (web/news/video tabs, side-peek, functional filters, routing-chip/catalogue, Home extra states) are explicitly deferred and not tasked here.

**Placeholder scan:** the visual-component tasks (C1–C7) intentionally instruct "pull values from the paper.design artboard + globals.css tokens" rather than inlining CSS values — this is the required procedure for a frozen external design source (design.md §9), not a placeholder; every such task still fixes exact file paths, props interfaces, copy strings (verbatim from the spec), and a pure-logic test. All pure logic (honest-count, source-status model, citation format, route contract, glue stubs) has complete code and tests.

**Type consistency:** `getCurrentUserId`/`checkRateLimit`/`RATE_LIMITS`/`getUserScopes`/`ScopeRecord`/`getDomainPreferences`/`DomainPreferenceRecord` signatures match the route's imports (verified against `ScholarSync@final-integration`). `runLiteratureSearch` params (`RunLiteratureSearchParams`) and return (`LiteratureSearchResult`) are consumed only inside the verbatim route. `SearchResponse`/`UnifiedSearchResult`/`SourceStatus` come from the copied `@/types/search`. UI mappers consume only `SearchResponse` fields that exist on the contract.
