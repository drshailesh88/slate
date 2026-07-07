# Explore — Tabs Live (Slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Explore's Web · News · Discussions · Videos tabs real — switch to any tab and see genuine results in the correct per-tab card, with an honest tab-appropriate count and quality caveat.

**Architecture:** UI-only. The route already returns real data for all four tabs. Widen the search hook to any `ExploreTab`, flip the tab gate, hoist the `TabBar` so it's switchable from every state, add per-tab card components + a per-tab honest-count + a Beta caveat, and branch the empty/unavailable/no-results states by tab. Engine and route untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Lucide, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-07-explore-tabs-live-design.md`

## Global Constraints

- **Backend is frozen:** no edits to the engine (`src/lib/search/**`), `src/lib/http/**`, `src/lib/ai/*`, `src/types/search.ts`, or `src/app/api/search/unified/route.ts`. This is a UI slice.
- **Honesty cornerstone:** never a silent `0`; non-academic tabs must never render "0 sources" or the academic "N matched across M sources" line; a whole-tab outage (`searxngUnavailable`, or all academic sources down) is a distinct "temporarily unavailable" state, not no-results.
- **Frozen skin (design.md §9):** color/font/motion are CSS tokens (NO raw hex); radius/spacing/type-size are raw px. `--serif` titles (incl. result titles), `--sans` body/UI, `--mono` every number/count/date. Hairline `--line` borders; flat (no shadows/gradients). Animate `transform`/`opacity` only; honor `prefers-reduced-motion`. Lucide icons only. Mirror the Slice-1 `src/components/explore/*` conventions.
- **No external requests that leak browsing:** do NOT fetch favicons from a third-party service (leaks the browsed domain) — use a Lucide `globe` marker instead. YouTube thumbnails (`img.youtube.com`) ARE allowed: the result is itself a YouTube video we already queried, so its own thumbnail is first-party to the result.
- **Non-academic cards ship Open only** (external link). `Cite` is academic-specific (a paper citation) — omit it on web/news/discussions/video cards, don't render it disabled.
- **Copy strings verbatim** from the spec / `explore-search-states.md §7`.
- **Tier 1 green before every commit:** `pnpm typecheck`, `pnpm lint` (zero warnings), and `pnpm exec prettier --check src/components/explore` (scoped — the repo is not globally prettier-clean; never reformat outside `src/components/explore`).
- **Layout note (deliberate, spec-aware):** the persistent `TabBar` + caveat render ABOVE the per-tab panel; the count line (`ResultHeader`) renders just under the tab bar within the active tab's panel (not above the tab bar as in spec §1's list order). This keeps tabs switchable from every state and the count bound to the active tab. Same tokens/components.

---

## Task 1: Per-tab metadata + honest-count branch

**Files:**
- Create: `src/components/explore/tab-meta.ts`
- Modify: `src/components/explore/honest-count.ts`
- Test: `src/components/explore/__tests__/tab-meta.test.ts`, extend `src/components/explore/__tests__/honest-count.test.ts`

**Interfaces:**
- Consumes: `ExploreTab` from `./tab-bar`.
- Produces:
  - `NON_ACADEMIC_TABS: ReadonlySet<ExploreTab>` = `web, news, discussions, videos`
  - `isAcademicTab(tab: ExploreTab): boolean`
  - `resultNoun(tab: ExploreTab, count: number): string` — non-academic: `web result(s)` · `news result(s)` · `discussion(s)` · `video(s)` (singular when count===1). Academic → throws/unused (academic uses its own line).
  - `WEB_CAVEAT: string` = `"Web results are early — we're still tuning quality. Academic is our strongest."`
  - `honestCount(res, tab: ExploreTab): string` (extended signature) — academic: existing `N matched across M sources` (+ cap disclosure); non-academic: `${group(res.total)} ${resultNoun(tab, res.total)}` (numeral will be wrapped `--mono` by `renderCountLine`).

- [ ] **Step 1: Write `tab-meta.ts` tests**

Create `src/components/explore/__tests__/tab-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NON_ACADEMIC_TABS, isAcademicTab, resultNoun } from '@/components/explore/tab-meta';

describe('tab-meta', () => {
  it('classifies academic vs non-academic', () => {
    expect(isAcademicTab('academic')).toBe(true);
    expect(isAcademicTab('web')).toBe(false);
    expect(NON_ACADEMIC_TABS.has('videos')).toBe(true);
  });
  it('pluralizes result nouns', () => {
    expect(resultNoun('web', 43)).toBe('web results');
    expect(resultNoun('web', 1)).toBe('web result');
    expect(resultNoun('news', 1)).toBe('news result');
    expect(resultNoun('discussions', 21)).toBe('discussions');
    expect(resultNoun('discussions', 1)).toBe('discussion');
    expect(resultNoun('videos', 50)).toBe('videos');
    expect(resultNoun('videos', 1)).toBe('video');
  });
});
```

- [ ] **Step 2: Run — verify fail; implement `tab-meta.ts`**

Create `src/components/explore/tab-meta.ts`:

```ts
import type { ExploreTab } from './tab-bar';

export const NON_ACADEMIC_TABS: ReadonlySet<ExploreTab> = new Set<ExploreTab>([
  'web',
  'news',
  'discussions',
  'videos',
]);

export function isAcademicTab(tab: ExploreTab): boolean {
  return tab === 'academic';
}

export const WEB_CAVEAT =
  "Web results are early — we're still tuning quality. Academic is our strongest.";

const NOUNS: Record<Exclude<ExploreTab, 'academic'>, [string, string]> = {
  web: ['web result', 'web results'],
  news: ['news result', 'news results'],
  discussions: ['discussion', 'discussions'],
  videos: ['video', 'videos'],
};

export function resultNoun(tab: ExploreTab, count: number): string {
  if (tab === 'academic') return count === 1 ? 'result' : 'results';
  const [one, many] = NOUNS[tab];
  return count === 1 ? one : many;
}
```

Run `pnpm test:run src/components/explore/__tests__/tab-meta.test.ts` → PASS.

- [ ] **Step 3: Extend `honest-count.test.ts` (RED)**

Add to `src/components/explore/__tests__/honest-count.test.ts`:

```ts
it('academic count is unchanged (across sources + cap)', () => {
  expect(
    honestCount(
      { matchedTotal: 3400, total: 200, sourceCounts: { pubmed: 1, europepmc: 1 } },
      'academic',
    ),
  ).toBe('3,400 matched across 2 sources · showing the top 200 by relevance');
});
it('non-academic count is tab-appropriate, never "sources"', () => {
  expect(honestCount({ total: 43, sourceCounts: { web: 43 } }, 'web')).toBe('43 web results');
  expect(honestCount({ total: 1, sourceCounts: { news: 1 } }, 'news')).toBe('1 news result');
  expect(honestCount({ total: 50, sourceCounts: { videos: 50 } }, 'videos')).toBe('50 videos');
});
```

(Update the existing academic-only test calls to pass `'academic'` as the 2nd arg.)

- [ ] **Step 4: Implement the branch in `honest-count.ts` (GREEN)**

```ts
import type { SearchResponse } from '@/types/search';
import { displaySources } from './source-display';
import { isAcademicTab, resultNoun } from './tab-meta';
import type { ExploreTab } from './tab-bar';

const group = (n: number) => n.toLocaleString('en-US');

export function honestCount(
  res: Pick<SearchResponse, 'matchedTotal' | 'total' | 'sourceCounts' | 'sourceStatuses'>,
  tab: ExploreTab,
): string {
  if (!isAcademicTab(tab)) {
    return `${group(res.total)} ${resultNoun(tab, res.total)}`;
  }
  const matched = res.matchedTotal ?? res.total;
  const sources = displaySources(res.sourceCounts, res.sourceStatuses).length;
  const sourceWord = sources === 1 ? 'source' : 'sources';
  const base = `${group(matched)} matched across ${sources} ${sourceWord}`;
  return matched > res.total
    ? `${base} · showing the top ${group(res.total)} by relevance`
    : base;
}
```

Run both test files → PASS. (Note: `ResultHeader` — Task 5 — will pass the new `tab` arg; `honest-count.ts` won't typecheck-break because its only caller is `ResultHeader`, updated in Task 5. If you run `pnpm typecheck` now it will flag the missing arg in `result-header.tsx` — that's expected and fixed in Task 5; do not gate typecheck on this task in isolation, gate the focused tests. Or apply the trivial Task-5 ResultHeader signature change alongside if you prefer a green typecheck here.)

- [ ] **Step 5: Commit**

```bash
git add src/components/explore/tab-meta.ts src/components/explore/honest-count.ts src/components/explore/__tests__/tab-meta.test.ts src/components/explore/__tests__/honest-count.test.ts
git commit -m "feat(explore): per-tab metadata + tab-appropriate honest count"
```

---

## Task 2: Shared result-url util + WebResultCard (Web/News/Discussions)

**Files:**
- Create: `src/components/explore/result-url.ts`, `src/components/explore/web-result-card.tsx` (+ `.module.css`)
- Modify: `src/components/explore/academic-result-card.tsx` (import the extracted `getResultUrl`)
- Test: `src/components/explore/__tests__/result-url.test.ts`, `src/components/explore/__tests__/web-result-card.test.tsx`

**Interfaces:**
- Produces:
  - `getResultUrl(result: UnifiedSearchResult): string | undefined` — `result.url ?? (result.doi ? \`https://doi.org/${result.doi}\` : undefined)`. (Extract from `academic-result-card.tsx`'s current local helper; re-import there.)
  - `<WebResultCard result={UnifiedSearchResult} variant={'web' | 'news' | 'discussions'} />` — Lucide `globe` marker + serif title (2-line clamp, links to `getResultUrl`, new tab, `rel="noopener noreferrer"`), meta line, 2-line snippet (`result.abstract`), hover-reveal **Open** action (Lucide `ExternalLink`). Meta by variant:
    - `web`: `{result.domain} · {formatDate(result.publishedAt)}` (date `--mono`, omit if absent).
    - `news`: `{result.sourceLabel ?? result.domain} · {formatDate(result.publishedAt)}`.
    - `discussions`: `{result.platform ?? result.sourceLabel} · {result.engagement}` (engagement numerals `--mono`, omit if absent).
- Consumes: `UnifiedSearchResult` (`@/types/search`), the Slice-1 hover-reveal + card CSS conventions.

- [ ] **Step 1: Extract + test `getResultUrl`**

Create `src/components/explore/result-url.ts`:

```ts
import type { UnifiedSearchResult } from '@/types/search';

export function getResultUrl(result: UnifiedSearchResult): string | undefined {
  return result.url ?? (result.doi ? `https://doi.org/${result.doi}` : undefined);
}
```

Create `src/components/explore/__tests__/result-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getResultUrl } from '@/components/explore/result-url';

const base = { title: 't', authors: [], journal: 'j', year: 2020, citationCount: 0, publicationTypes: [], sources: [], isOpenAccess: false };

describe('getResultUrl', () => {
  it('prefers url', () => { expect(getResultUrl({ ...base, url: 'https://x' })).toBe('https://x'); });
  it('falls back to doi', () => { expect(getResultUrl({ ...base, doi: '10.1/x' })).toBe('https://doi.org/10.1/x'); });
  it('undefined when neither', () => { expect(getResultUrl(base)).toBeUndefined(); });
});
```

Run → after implementing, PASS. Then update `academic-result-card.tsx` to `import { getResultUrl } from './result-url'` and delete its local copy; run the academic card tests to confirm no regression.

- [ ] **Step 2: Write `web-result-card.test.tsx` (RED)**

Create it asserting real behavior: a `web` card renders the domain + snippet + an Open link with the correct `href`/`target="_blank"`; a `discussions` card renders `platform` + `engagement` (e.g. "Hacker News", "126 points · 67 comments"); a `news` card renders the outlet `sourceLabel`. No `Cite` button present (grep the rendered output — Cite must be absent). Use minimal type-correct `UnifiedSearchResult` fixtures.

- [ ] **Step 3: Build `web-result-card.tsx` + `.module.css` (GREEN)**

Mirror `academic-result-card.tsx`'s structure/hover-reveal/tokens. Lucide `globe` marker (`--muted`). Serif title. Meta per variant (above). Open action only. A tiny `formatDate(iso?: string): string` helper (locale short date, `--mono`; omit when absent) — inline or in `tab-meta`/`result-url`; keep it pure. All values from tokens/px; no hex.

- [ ] **Step 4: Run tests → PASS; typecheck/lint/prettier (scoped) → clean.**

- [ ] **Step 5: Commit** `feat(explore): web/news/discussions result card + shared result-url`.

---

## Task 3: YouTube thumbnail util + VideoResultCard

**Files:**
- Create: `src/components/explore/youtube.ts`, `src/components/explore/video-result-card.tsx` (+ `.module.css`)
- Test: `src/components/explore/__tests__/youtube.test.ts`, `src/components/explore/__tests__/video-result-card.test.tsx`

**Interfaces:**
- Produces:
  - `youtubeVideoId(url?: string): string | null` — parse `v=` from a YouTube watch URL (also handle `youtu.be/{id}`); null if absent.
  - `youtubeThumbnail(url?: string): string | null` — `https://img.youtube.com/vi/{id}/mqdefault.jpg` or null.
  - `<VideoResultCard result={UnifiedSearchResult} />` — thumbnail (plain `<img loading="lazy">` with the derived URL; `onError` hides it → no broken image; hairline `--line`, rounded per §5), title + channel (`result.sourceLabel`) + date (`--mono`), Open action (title/thumbnail link to `getResultUrl`, new tab, `rel="noopener noreferrer"`). NO duration, NO transcript affordance (Slice 4), NO Cite.

- [ ] **Step 1: Write `youtube.test.ts` (RED)**

```ts
import { describe, it, expect } from 'vitest';
import { youtubeVideoId, youtubeThumbnail } from '@/components/explore/youtube';

describe('youtube helpers', () => {
  it('extracts id from watch url', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=soH2Siy_ho4')).toBe('soH2Siy_ho4');
  });
  it('extracts id from youtu.be', () => {
    expect(youtubeVideoId('https://youtu.be/abc123')).toBe('abc123');
  });
  it('null for non-youtube', () => {
    expect(youtubeVideoId('https://example.com')).toBeNull();
    expect(youtubeVideoId(undefined)).toBeNull();
  });
  it('builds thumbnail url', () => {
    expect(youtubeThumbnail('https://www.youtube.com/watch?v=xyz')).toBe(
      'https://img.youtube.com/vi/xyz/mqdefault.jpg',
    );
    expect(youtubeThumbnail('https://example.com')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `youtube.ts` (GREEN)** — robust `v=`/`youtu.be` parsing via `URL` where possible with a regex fallback; run → PASS.

- [ ] **Step 3: Write `video-result-card.test.tsx` (RED)** — asserts: thumbnail `<img>` has the derived src; channel + title render; Open link href correct; no Cite; no "duration". Build `video-result-card.tsx` + css (GREEN).

- [ ] **Step 4: tests PASS; typecheck/lint/prettier (scoped) clean.**

- [ ] **Step 5: Commit** `feat(explore): video result card + youtube thumbnail util`.

---

## Task 4: Enable tabs — widen hook, flip gate, generalize ResultHeader

**Files:**
- Modify: `src/components/explore/use-unified-search.ts` (widen `tab`), `src/components/explore/tab-bar.tsx` (`ENABLED_TABS`), `src/components/explore/result-header.tsx` (per-tab count + academic-only chip)
- Test: extend `src/components/explore/__tests__/use-unified-search.test.tsx`, add `src/components/explore/__tests__/result-header.test.tsx`

**Interfaces:**
- Produces:
  - `useUnifiedSearch(query: string, tab: ExploreTab): SearchState` — widen the param AND the internal `CompletedResult.tab` type from `'academic'` to `ExploreTab`. Behavior otherwise unchanged (aborts stale, refetches on tab change since `tab` is already a dep).
  - `ENABLED_TABS` = all five tabs (delete the Slice-1 single-academic set; every tab is now interactive).
  - `<ResultHeader data={SearchResponse} tab={ExploreTab} />` — count line = `honestCount(data, tab)`; the `SourceStatusChip` + `Sources ▾` render ONLY when `isAcademicTab(tab)` (non-academic shows the count line alone).
- Consumes: `ExploreTab` (`./tab-bar`), `honestCount` (Task 1), `isAcademicTab` (`./tab-meta`).

- [ ] **Step 1: Widen the hook** — change the two `'academic'` type annotations to `ExploreTab` (import the type from `./tab-bar`). Extend the existing hook test with a case: `useUnifiedSearch('q', 'web')` requests `...&tab=web` (assert the mocked fetch URL) and transitions loading→success. Run → PASS.

- [ ] **Step 2: Flip `ENABLED_TABS`** — set it to `new Set<ExploreTab>(['academic','web','news','discussions','videos'])` (or derive from `TABS`). Update `tab-bar.test.tsx`: Web is now enabled (`not.toBeDisabled()`), `onSelect('web')` fires on click, and the `Beta` tag now renders on non-academic tabs based on `NON_ACADEMIC_TABS` (Beta marks quality, not disabled — keep the Beta tag on web/news/discussions/videos; drop it from academic). Run → PASS.

  Note: `Beta` now means "early quality," not "disabled." Render `Beta` for `NON_ACADEMIC_TABS`, regardless of enabled state.

- [ ] **Step 3: Generalize `ResultHeader`** — add the `tab` prop; call `honestCount(data, tab)`; wrap the `SourceStatusChip` + `Sources ▾` block in `isAcademicTab(tab)`. Add `result-header.test.tsx`: academic → chip present + "matched across"; web → count "43 web results", NO chip, NO "Sources" button. Run → PASS.

- [ ] **Step 4: typecheck/lint/prettier (scoped) clean** (the `honest-count` caller is now correct). Commit `feat(explore): enable all tabs (widen hook, flip gate, per-tab result header)`.

---

## Task 5: Per-tab NoResults, SourcesUnavailable, and the TabCaveat

**Files:**
- Modify: `src/components/explore/no-results.tsx`, `src/components/explore/sources-unavailable.tsx`
- Create: `src/components/explore/tab-caveat.tsx` (+ `.module.css`)
- Test: extend the relevant `__tests__`, add `tab-caveat.test.tsx`

**Interfaces:**
- Produces:
  - `<NoResults query={string} tab={ExploreTab} onSwitchTab={(tab: ExploreTab) => void} />` — headline per tab: academic `No papers matched "{query}" in Academic.`; non-academic `No {noun-plural} for "{query}".` (use `resultNoun(tab, 0)` → plural). Action: academic → `Search the Web →` (calls `onSwitchTab('web')`); non-academic → `Search Academic →` (calls `onSwitchTab('academic')`). The action is now LIVE (tabs are enabled) — not disabled. Keep `Clear filters` disabled (filters still inert, Slice 2c).
  - `<SourcesUnavailable tab={ExploreTab} onRetry={() => void} />` — headline `{TabLabel} search is temporarily unavailable` (academic: `Academic search is temporarily unavailable`; web: `Web search is temporarily unavailable`); body unchanged; add a `--muted` line for non-academic: `Academic is unaffected.` Retry unchanged.
  - `<TabCaveat tab={ExploreTab} />` — renders the `WEB_CAVEAT` `--muted` note for `web|news|discussions`; renders `null` for `academic` and `videos`.
- Consumes: `resultNoun`/`WEB_CAVEAT` (`./tab-meta`), `ExploreTab`.

- [ ] **Step 1: TabCaveat (TDD)** — test: `web`/`news`/`discussions` render the caveat text; `academic`/`videos` render nothing. Implement. Run → PASS.
- [ ] **Step 2: NoResults per-tab** — extend/replace copy + wire the live `onSwitchTab` action; test academic vs web headlines + that the action button calls `onSwitchTab` with the right tab. Run → PASS.
- [ ] **Step 3: SourcesUnavailable per-tab** — add `tab`, per-tab headline + "Academic is unaffected." for non-academic; test academic vs web copy. Run → PASS.
- [ ] **Step 4: typecheck/lint/prettier (scoped) clean; commit** `feat(explore): per-tab no-results, unavailable, and quality caveat`.

---

## Task 6: ExplorePageClient — tab state, persistent chrome, per-tab dispatch

**Files:**
- Modify: `src/components/explore/explore-page-client.tsx`
- Create: `src/components/explore/result-card.tsx` (per-tab card dispatcher)
- Test: extend `src/components/explore/__tests__/explore-page-client.test.tsx`

**Interfaces:**
- Consumes: everything above — `useUnifiedSearch(query, tab)`, `TabBar`, `TabCaveat`, `ResultHeader`, `FilterPills`, `AcademicResultCard`/`WebResultCard`/`VideoResultCard`, `NoResults`, `SourcesUnavailable`, `SearchError`, `ResultsSkeleton`, `SourceDegradedNote`, `sourceStatusModel`, `NON_ACADEMIC_TABS`.
- Produces:
  - `<ResultCard result={UnifiedSearchResult} tab={ExploreTab} />` — dispatches: `academic`→`AcademicResultCard`; `videos`→`VideoResultCard`; `web`→`WebResultCard variant="web"`; `news`→`variant="news"`; `discussions`→`variant="discussions"`.
  - `ExplorePageClient` owns `query`, `activeTab` (seed from `?tab=` if a valid `ExploreTab`, else `'academic'`), `attempt`. Renders `<SearchBar>` (persistent) then `<ExploreResults key={\`${query}::${activeTab}::${attempt}\`} query tab={activeTab} onSelectTab onRetry />`.
  - `ExploreResults` renders, in order: `<TabBar active={tab} onSelect={onSelectTab} />`, `<TabCaveat tab={tab} />`, then the state-dependent body:
    - `idle` → the calm idle prompt (academic wording is fine as-is).
    - `loading` → `<ResultsSkeleton />`.
    - `error` → `<SearchError query onRetry />`.
    - `success` + results → `<ResultHeader data tab />`, then (academic only) `sourceStatusModel(...).degraded && <SourceDegradedNote>`, then `<FilterPills />`, then the staggered list of `<ResultCard result tab />`.
    - `success` + empty → branch by tab: academic uses the existing `allSourcesDown` (from `sourceStatuses`); non-academic uses `data.searxngUnavailable === true`. If down → `<SourcesUnavailable tab onRetry />`, else `<NoResults query tab onSwitchTab={onSelectTab} />`.

- [ ] **Step 1: Build `result-card.tsx`** (the dispatcher) + a render test (each tab → the right card component; e.g. a video result renders an `<img>`, a discussions result renders engagement). Run → PASS.
- [ ] **Step 2: Rewrite `ExplorePageClient`/`ExploreResults`** per the interface above. `onSelectTab` = `setActiveTab`. `?tab=` sync: on `activeTab` change, `router.replace` the URL preserving `q` (use `next/navigation` `useRouter` + `useSearchParams`; guard invalid tab values). Keep the keyed-remount retry (now keyed on query+tab+attempt). Staggered entrance unchanged (cap ≤6, reduced-motion safe).
- [ ] **Step 3: Extend `explore-page-client.test.tsx`** (mock `useUnifiedSearch`, mock `next/navigation`): 
  - selecting the Web tab calls the hook with `tab='web'` and renders a web card + the "N web results" count + the web caveat + NO source chip.
  - a non-academic empty result with `searxngUnavailable:true` → `SourcesUnavailable` ("Web search is temporarily unavailable"), NOT "0 sources", NOT "No … matched".
  - a non-academic empty result with `searxngUnavailable:false` → per-tab `NoResults` whose action switches to academic.
  - academic still shows the source chip + degraded note path (regression).
  - the TabBar renders in the loading state (switchable from any state).
  Run → PASS.
- [ ] **Step 4: Full gate** — `pnpm typecheck`, `pnpm lint`, `pnpm test:run`, `pnpm exec prettier --check src/components/explore` all clean. Commit `feat(explore): live tab switching + per-tab card dispatch + states`.

---

## Task 7: End-to-end verification

- [ ] **Step 1: Live all five tabs** — `op-run -- bash -c 'WORKOS_API_KEY= WORKOS_CLIENT_ID= WORKOS_COOKIE_PASSWORD= exec pnpm dev'` (dev bypass + real keys). Open `/explore?q=SGLT2 inhibitors heart failure`. Click through Academic → Web → News → Discussions → Videos. Confirm each shows real results in the right card, the tab-appropriate count, the Beta caveat on web/news/discussions, and no "0 sources" anywhere. Screenshot Web + Videos.
- [ ] **Step 2: Degraded/empty** — a nonsense query on Web → per-tab No-results with a working "Search Academic". (Whole-tab-unavailable is hard to force live; the integration test covers it.)
- [ ] **Step 3: Tier 1** — `pnpm typecheck && pnpm lint && pnpm test:run` all green.
- [ ] **Step 4: Invoke the `verify` skill**, then open a PR: `feat(explore): tabs live (Web/News/Discussions/Videos)`. Body: what changed, why (Slice 2a), how to test; note 2b (side-peek) / 2c (filters) / 2d (mobile) follow-ups.

---

## Self-Review

**Spec coverage:** backend-none §1 → Global Constraints + no route/engine tasks; tab switching §2 → Task 4 (hook/gate) + Task 6 (state/URL); per-tab cards §3 → Task 2 (web/news/discussions) + Task 3 (video) + Task 6 (dispatch); favicon=Lucide-globe / video thumbnail §3/§8 → Task 2/3 + Global Constraints; honesty §4 → Task 1 (count) + Task 4 (chip academic-only) + Task 6 (searxngUnavailable branch, "never 0 sources" test); caveat §4 → Task 5; states §5 → Task 5 + Task 6; testing §7 → each task + Task 7. Deferred (side-peek/filters/mobile/reading-room) correctly untasked.

**Placeholder scan:** pure utils (tab-meta, honest-count, result-url, youtube) have complete code + tests; component tasks give exact props, copy strings, token rules, and a named test per component (JSX pulls from tokens/existing conventions — the required procedure for the frozen skin, not a placeholder). No TBD/TODO.

**Type consistency:** `ExploreTab` (from `./tab-bar`) threads through `useUnifiedSearch`, `honestCount`, `ResultHeader`, `NoResults`, `SourcesUnavailable`, `TabCaveat`, `ResultCard`. `honestCount(res, tab)` 2-arg signature is updated at its only caller (`ResultHeader`, Task 4) — Task 1 notes the interim. `getResultUrl` extracted once (Task 2), reused by all cards. `resultNoun`/`WEB_CAVEAT`/`NON_ACADEMIC_TABS`/`isAcademicTab` all from `tab-meta`.
