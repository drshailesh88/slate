# Explore — Academic Search Slice (Slice 1) — Design Spec

**Date:** 2026-07-06
**Status:** Approved — ready for implementation plan
**Authorities:** `docs/design/design.md` (frozen skin) · `docs/design/specs/explore-search-states.md` · `docs/design/specs/composer-states.md` · `docs/design/specs/home-states.md` · `docs/design/CRAFT-ADDENDUM.md` · `docs/design/STATE-INVENTORY.md`
**Engine source of record:** `/Users/shaileshsingh/ScholarSync` @ branch `final-integration` (see `docs/SEARCH-BACKEND-MANIFEST.md` there).

---

## 0. Goal (what "done" means for Slice 1)

You type a research question on Home, press send, land on Explore, and see **genuinely real** academic papers — with an **honest match count**, **honest source degradation** (never a silent `0`), a Loading skeleton, a No-results teach-state, and an Error state. Nothing is mocked; the search runs the carried-over engine against real academic databases via keys injected from the Dev vault.

Non-goals for Slice 1 (deliberately deferred, named so we don't box them in):
- Web / News / Discussions / Videos tabs (visible but disabled, marked `Beta`) → **Slice 2**
- Source Side-peek, functional Sort/Time/Scope filters, mobile polish → **Slice 2**
- Composer routing-chip variants, `+` catalogue, attachment intake, clarify-nudge, Deep-research Clarifier → **Slice 3**
- Home first-run/loading/error/offline states, video reading-room → **Slice 4**
- Real Upstash cache/rate-limit, DB-backed scopes/domain-preferences, eval harness carry → **Later**

---

## 1. Decomposition (the whole effort)

"Real Home + Explore" is four slices. This spec is Slice 1 — a complete, shippable, real vertical.

| Slice | Scope |
|---|---|
| **1 (this spec)** | Whole engine carried over, wired **academic-only**; Explore Academic surface (Populated / Loading / No-results / Source-degraded / Error); Composer → Explore real submit. |
| **2** | Widen tabs (Web/News/Discussions/Videos + Beta caveats); Source Side-peek; functional Sort/Time/Scope; mobile. |
| **3** | Composer full agentic states (routing-chip variants, `+` catalogue, attachment, clarify-nudge); Deep-research Clarifier handoff. |
| **4** | Home first-run/loading/error/offline states; video reading-room. |
| **Later** | Real Upstash; DB-backed scopes/domain-prefs; eval harness. |

---

## 2. The seam (frozen contract)

`src/types/search.ts` — `SearchResponse` / `UnifiedSearchResult` — copied **verbatim** from the engine. This is the only type Explore and the Composer ever touch. The Explore design spec maps onto it 1:1:

| Design need | Contract field |
|---|---|
| Honest count line (`142 matched across 5 sources`) | `matchedTotal` (uncapped) + `total` (capped) |
| Source-status chip / degraded disclosure | `sourceStatuses: Record<string, SourceStatus>` |
| Per-source counts (`Sources ▾`) | `sourceCounts: Record<string, number>` |
| Routing-chip continuity (interpreted query) | `augmentedQueries` |
| Academic card (title, authors, journal, year, quartile, study type, citations, snippet) | `UnifiedSearchResult.{title,authors,journal,year,journalQuartile,studyType,citationCount,abstract,...}` |

**Rule:** the contract is frozen for the slice. If the engine's real output reveals a field the UI needs that isn't there, we change the design's use of the contract — we do not fork the type.

---

## 3. Engine placement (copy verbatim, same paths)

Copied into slate at identical paths (the tree is self-contained and wire-ready):

- `src/lib/search/**` — the whole engine (187 files), **including** `result-cache.ts` (self-degrades to in-memory when Upstash env absent — no change needed).
- `src/lib/http/{circuit-breaker,outbound-limiter,resilient-fetch}.ts` — the resilient fetch layer.
- `src/lib/ai/{models.ts,query-augment.ts}` — model factories + query augmentation.
- `src/types/search.ts` — the shared result types (the seam).
- `src/app/api/search/unified/route.ts` — THE entry point (rewired — see §4).

**Left behind** (per the manifest): old per-source routes (`/api/search/{pubmed,openalex,...}`), and every non-search app module (editor, studio, latex, library, dashboard, …). Deep-research is out of Slice 1.

Video knowledge (`youtube-transcript.ts`, `study-notes.ts`, `/api/youtube/summary`) is copied with the tree but not wired until Slice 4.

---

## 4. Integration glue (slate-native, thin)

The engine's only true external couplings are the four `@/lib/http|ai` modules + `@/types/search` (all copied). The **route** carries thin integration glue we replace with slate-native equivalents — "behaviour, not code, carries: a user id, a domain preference, a rate limiter."

| Glue module | Slice-1 approach |
|---|---|
| `getCurrentUserId` (was Clerk `@/lib/auth`) | Rewire to slate `getSessionUser()` (WorkOS session; dev-mock id outside production, matching the existing shell bypass). |
| `src/lib/rate-limit.ts` | Copy near-verbatim — it is already in-memory-first (sliding window) and exports exactly `checkRateLimit` + `RATE_LIMITS`. Engages memory path automatically without Upstash. |
| `src/lib/logger.ts` | Trivial console logger matching the used surface (`logger.info/warn/error`). |
| `src/lib/actions/scopes.ts` | Stub: `getUserScopes()` → `[]` (no scope filtering yet); keep the `ScopeRecord` type shape the route imports. |
| `src/lib/actions/domain-preferences.ts` | Stub: `getDomainPreferences()` → neutral (empty) preferences. |
| `src/lib/langfuse.ts` | Stub: `isLangfuseConfigured()` → `false`; `getLangfuse()` → no-op trace object. |
| `src/lib/search/domains/user-domain.ts` (`getCurrentUserDomainConfig`) | Keep as-is if self-contained; if DB-coupled, stub to the default domain config. Verify during implementation. |
| Upstash cache + rate-limit | **Not installed.** Memory paths engage automatically. Real Upstash is a Later concern. |
| Secrets | Run dev as `op-run -- pnpm dev`; all real keys inject from the Dev vault. No `.env` secret committed. |

**Dependency closure:** installed via typecheck-driven iteration — add exactly what the copied tree imports (AI SDK: `ai`, `@ai-sdk/openai`; `zod`; XML/parse utils used by academic sources; `@upstash/redis` as an optional peer required at type/require time; etc.), nothing from the legacy editor/studio surface. `pnpm typecheck` is the oracle for "what's missing."

**Env the academic lane actually reads** (all present in the Dev vault): `DEEPSEEK_API_KEY` (+ `DEEPSEEK_MODEL`) for `augmentQuery`; academic source keys `PUBMED_API_KEYS`, `OPENALEX_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`, `SCOPUS_API_KEY`/`ELSEVIER_API_KEY`, `SPRINGER_API_KEY`; optional `COHERE_API_KEY`, `MEDCPT_*` for dense/rerank. Missing keys must degrade a source (surface via `sourceStatuses`), never crash the request.

---

## 5. Explore UI (new)

Route: `src/app/(app)/explore/page.tsx` — server component; reads `?q=` (and future `?tab=`); renders the locked app shell (labeled sidebar + topbar, identical to Home) with a **top-aligned, scrolling** main column (not centered like Home). Delegates to the client.

Client + components under `src/components/explore/**` (anchor: `ExplorePageClient.tsx`), one concern per file (coding-style: 200–400 lines, feature-grouped):

- `ExplorePageClient.tsx` — owns query / active tab / filter state; fetches `/api/search/unified`; renders the state machine (Loading → Populated / No-results / Source-degraded / Error).
- `SearchBar.tsx` — current query, editable in place, Lucide `search` glyph, ⌘K affordance; submit re-runs.
- `ResultHeader.tsx` — honest count line (`--mono` numerals) + `SourceStatusChip` + `Sources ▾`.
- `SourceStatusChip.tsx` — from `sourceStatuses`: all-ok (`5 sources`) vs degraded (`4 of 5 sources · Scopus temporarily unavailable`, Amber dot, reason tooltip). Reuse the engine's `SourceStatus` classes.
- `TabBar.tsx` — `Academic · Web · News · Discussions · Videos`. Academic active (`--ink` label + 2px `--ink` underline). Non-academic **visible but disabled**, each with a `Beta` tag (Slice 2 enables them).
- `FilterPills.tsx` — `Scope ▾ · Sort: Relevance ▾ · Time: Any year ▾` rendered but **inert/disabled** in Slice 1 (the results already arrive relevance-sorted from the engine). We do not fake server-side filtering; functional filters are Slice 2. Inert pills read as "present, not yet active," never as applied-but-lying.
- `ResultList.tsx` + `AcademicResultCard.tsx` — the reference card: serif title (links out), meta line (`Authors · Journal · Year`, year `--mono`), badge row (`JournalQuartileBadge` monochrome Q1–Q4, study-type chip, citations `--mono`), 2-line snippet, hover-reveal actions. Slice 1 ships **`Open`** (external link) + **`Cite`** (pure client-side — format authors/journal/year/DOI, copy to clipboard; needs no backend). `Save` and `Add to project` need persistence → **Slice 2** (omitted from the row in Slice 1, not shown as dead/disabled buttons).
- State components: `ResultsSkeleton.tsx` (Status shimmer rows, never a spinner), `NoResults.tsx` (teach-the-move: serif `No papers matched "…" in Academic.` + body + `Clear filters` · `Search the Web →`), `SourceDegradedNote.tsx` (calm Amber strip above results), `SearchError.tsx` (Tomato `alert-triangle`, `Couldn't run that search`, query preserved, `Try again`).

**Deferred, called out (not silently dropped):** card click → Source Side-peek is **Slice 2**; in Slice 1 the title links to the source. Filters are visual/basic in Slice 1.

**Skin discipline:** every value from `src/app/globals.css` tokens + `docs/design/reference/*` + the paper.design artboards as visual ground truth. No raw hex, no raw durations/easings. Animate `transform`/`opacity` only; honor `prefers-reduced-motion` (design.md §8/§9). Motion jobs: results entrance → Continuity (staggered, cap ≤6, entrance-only); loading → Status shimmer.

---

## 6. Composer (upgrade existing)

`src/components/home/composer.tsx`:
- Slice 1: Enter (without Shift) or Send → navigate to `/explore?q=<encoded query>`. The existing typing→send-fills behaviour stays.
- Deferred to Slice 3 (named): routing-chip variants (`Will run · {Route} · {scope}`), `+` catalogue, attachment intake, clarify-nudge.

Home itself (`src/app/(app)/page.tsx`) keeps its rest state; only the composer's submit behaviour changes in Slice 1.

---

## 7. Data flow

```
Home composer (type intent)
  → navigate /explore?q=…
    → explore/page.tsx (server shell) → ExplorePageClient
      → GET /api/search/unified?q=…&tab=academic
        → unified/route.ts (rewired glue)
          → augmentQuery (DeepSeek) → runLiteratureSearch (academic lanes)
          → ranking / fusion / rerank / dedup
          → SearchResponse { results, matchedTotal, sourceCounts, sourceStatuses, augmentedQueries }
      → render: honest count + source-status + tabs + filters + result cards
```

Error/degradation propagation: a source failure sets `sourceStatuses[source] != ok`; the UI renders the Amber degraded note and **never** reads its zero count as "no results." A whole-request failure renders `SearchError` with the query preserved.

---

## 8. Testing & verification

Per the `verify` skill — exercise the real flow, not just tests:
1. `op-run -- pnpm dev`; open `/explore?q=SGLT2 inhibitors in HFpEF`.
2. Confirm real papers from ≥2 academic sources; `matchedTotal` drives the honest count line.
3. Induce a degraded source (e.g., unset one key / force a timeout) → Amber degraded note appears; no silent `0`.
4. Reach Loading skeleton (throttle), No-results (nonsense query), Error (kill the route) states.
5. Home composer submit → lands on Explore with the typed query.
6. Tier 1 green: `pnpm typecheck` and `pnpm lint` (zero warnings). Add unit tests for the pure UI mappers (honest-count string, source-status → chip model) and any glue stub.

---

## 9. Git

Branch: `feat/search-slice-academic`. Logical commits in order:
1. `feat(search): carry over search engine tree + http/ai couplings + types`
2. `feat(search): slate-native integration glue (auth, rate-limit, logger, prefs stubs)`
3. `feat(search): rewire /api/search/unified to slate auth/db/rate-limit`
4. `feat(explore): academic results surface (populated/loading/no-results/degraded/error)`
5. `feat(home): composer submits to Explore`

Each commit: Tier 1 green before it lands. No secrets in any diff. `main` stays deployable.

---

## 10. Risks & mitigations

- **Hidden DB couplings** in `user-domain.ts` / actions → verify each glue import during implementation; stub to safe defaults; typecheck is the tripwire.
- **Dependency sprawl** — resist pulling legacy deps; install only the academic-lane closure; if a source file drags in a heavy unused dep, confirm it's on the academic path before adding.
- **Contract drift** — freeze `src/types/search.ts`; adapt UI to real output, never fork the type.
- **Skin drift** — pull exact values from tokens/reference/paper.design; design.md §9 hard rules are non-negotiable.
- **Real-key cost/latency** — academic fan-out legitimately runs ~8–12s (`maxDuration = 60`); the Loading skeleton must feel calm, not broken.
