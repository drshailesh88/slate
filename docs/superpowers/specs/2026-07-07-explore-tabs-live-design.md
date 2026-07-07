# Explore — Tabs Live (Slice 2a) — Design Spec

**Date:** 2026-07-07
**Status:** Approved — ready for implementation plan
**Predecessor:** Slice 1 (`2026-07-06-explore-academic-search-slice-design.md`) shipped Academic search end-to-end (merged, PR #17).
**Authorities:** `docs/design/design.md` (frozen skin) · `docs/design/specs/explore-search-states.md` (§2 per-tab cards, §3 caveats, §7 copy) · `docs/design/CRAFT-ADDENDUM.md` · `docs/design/STATE-INVENTORY.md`.

---

## 0. Goal

Make Explore's other four tabs — **Web · News · Discussions · Videos** — real: switch to any tab and see genuine results in the correct per-tab card, with an honest tab-appropriate count and an honest quality caveat. The backend already returns real data for all four; this is a **UI-only** slice.

**In scope:** enable the 4 non-academic tabs, per-tab card variants, tab-switch refetch, per-tab honest count + Beta quality caveat, per-tab whole-tab-unavailable/no-results states, and the `source-display` fix so non-academic tab keys don't misread as "0 sources."

**Explicitly deferred (own slices, named so we don't box them in):**
- Source **Side-peek** (card click → side panel) → **Slice 2b**
- Functional **Sort/Time/Scope** filters (pills stay inert) → **Slice 2c**
- **Mobile** responsiveness (scrollable tabs, filter bottom-sheet, full-screen peek) → **Slice 2d**
- Video **"Transcript & takeaways"** affordance + the reading-room → **Slice 4**

---

## 1. Backend: no changes

Confirmed live (under `op-run`): `GET /api/search/unified?tab={web|news|discussions|videos}` returns real results today. No engine or route edits. The response shape for non-academic differs from academic and drives the UI decisions below:

| Field | Academic | Non-academic |
|---|---|---|
| `matchedTotal` | present (uncapped) | **absent** |
| `sourceStatuses` | present (per-source health) | **absent** |
| `sourceCounts` | per-source (`{pubmed:…, europepmc:…}`) | single tab key (`{web: 43}`) |
| `searxngUnavailable` | `false` | signals degradation |
| Result fields used | title, authors, journal, year, quartile, studyType, citationCount, abstract | title, `url`, `domain`, `sourceLabel`, `publishedAt`, `abstract`, `trustTier`; Discussions adds `platform` + `engagement`; Videos: `sourceLabel`=channel, url=`youtube.com/watch?v={id}` |

**Video data gap:** the response has no `thumbnail` or `duration`. Thumbnail is derived client-side from the video id (`https://img.youtube.com/vi/{id}/mqdefault.jpg`); **duration is omitted** (would need a separate `videos.list` backend call — out of scope).

---

## 2. Tab switching

- Flip `ENABLED_TABS` in `tab-bar.tsx` to all five tabs.
- Widen the hook: `useUnifiedSearch(query: string, tab: ExploreTab)` (currently typed `'academic'`). `tab` is already an effect dependency, so a tab change refetches and aborts the stale request.
- `ExplorePageClient` owns `activeTab` (default `'academic'`, seeded from `?tab=` if present); `TabBar.onSelect` sets it. On tab change, results reset to loading for the new tab.
- **URL sync:** reflect the active tab as `?tab=` (shareable deep-link) via `router.replace` without scroll — low-cost, keeps the query+tab in the URL. Query stays the single source from `?q=`.

---

## 3. Per-tab result cards (new components)

`ResultList` selects the card component by `activeTab`. Each card follows the frozen skin (color/font/motion tokens; px spacing; hover-reveal Open + Cite per Slice 1; title links to `url`; Side-peek deferred to 2b).

### `WebResultCard` — Web / News / Discussions
Structurally identical; a `variant: 'web' | 'news' | 'discussions'` prop tunes the meta line:
- **Common:** a source marker (Lucide `globe`, `--muted` — see favicon note), **serif title** (`--serif`, matching academic result titles per design.md §4 "serif for titles"; 2-line clamp, links to `url`), meta `domain · {formatted date}` (date `--mono`), 2-line snippet (`abstract`). No quartile/study-type. `trustTier` shown as a small `--muted` marker where present (government/major_journalism/community).
- **News:** meta shows the outlet (`sourceLabel`, e.g. "University at Buffalo") + date.
- **Discussions:** meta shows `platform` (Hacker News / Reddit / StackExchange) + `engagement` ("126 points · 67 comments", numerals `--mono`).
- **Favicon note:** if a remote favicon can't be fetched cheaply/privately, use a monochrome Lucide `globe` per design.md (Lucide-only) rather than a third-party favicon service — decide at build time favoring privacy (no external calls that leak the query/domain). Default: **Lucide `globe`** marker, not a remote favicon, to stay within the "no external requests / privacy" posture. (Revisit in 2b.)

### `VideoResultCard` — Videos
- Thumbnail left (derived from video id; `max-width` responsive, hairline `--line`, `--r` per §5), title + channel (`sourceLabel`) + date (`--mono`).
- **No duration** (data gap). **No transcript affordance** yet (Slice 4). Title/thumbnail link to the YouTube url (new tab, `rel="noopener noreferrer"`).

Academic keeps its existing `AcademicResultCard`.

---

## 4. Honesty for non-academic tabs

The honesty cornerstone must hold with the different non-academic response shape.

- **Count line (`honest-count.ts`):** branch by tab.
  - Academic: unchanged (`N matched across M sources` + cap disclosure via `matchedTotal`).
  - Non-academic: tab-appropriate, no fake "sources": `{total} web results` · `{total} news results` · `{total} discussions` · `{total} videos` (numeral `--mono`; singular `1 web result`). Uses `total` (no `matchedTotal`).
- **Source chip:** academic-only. On non-academic tabs, render **no source-status chip**.
- **`source-display.ts` fix:** it currently excludes unknown keys, so `{web:43}` would yield 0 display sources → a "0 sources" misread if reused. Guard: `displaySources`/count logic is only used on the academic path; the non-academic count path never calls it. (Add a test asserting non-academic never renders "0 sources".)
- **Quality caveat (§3):** under the tab bar, when Web/News/Discussions is active, a one-line `--muted` note: *"Web results are early — we're still tuning quality. Academic is our strongest."* (exact §7 copy). Videos: **no caveat** (per approved Decision C). Academic: none.
- **Whole-tab-down:** reuse the `SourcesUnavailable` state with per-tab copy: *"{Tab} search is temporarily unavailable. Academic is unaffected."*, driven by the non-academic degradation signal (`searxngUnavailable === true` with empty results, or an error). Distinct from no-results.

---

## 5. States (per tab)

The existing state machine composes; only the card, count line, and caveat vary by tab:
- **Loading** → existing skeleton (tab bar + search bar persist; result cards skeleton).
- **Populated** → per-tab card list + tab-appropriate count + caveat (non-academic).
- **No-results** → per-tab copy: *"No {web/news/discussions/video} results for '{query}'."* + action *"Search Academic →"* (switches to the academic tab). Never blank.
- **Whole-tab-unavailable** → §4 per-tab copy.
- **Error** → existing `SearchError` (query preserved).

Motion: results entrance = Continuity (staggered, cap ≤6, reduced-motion safe) — same as Slice 1.

---

## 6. Components touched / created

- **Modify:** `tab-bar.tsx` (`ENABLED_TABS` → all), `use-unified-search.ts` (widen `tab` param type), `explore-page-client.tsx` (owns `activeTab`, per-tab card selection, caveat, `?tab=` sync, per-tab no-results/unavailable copy), `honest-count.ts` (per-tab branch), `no-results.tsx` (per-tab copy), `sources-unavailable.tsx` (per-tab copy).
- **Create:** `web-result-card.tsx` (+css), `video-result-card.tsx` (+css), `result-list.tsx` (or extend the existing list) with per-tab card selection, `tab-caveat.tsx` (+css).
- **Keep:** `academic-result-card`, `result-header` (academic-only chip), `filter-pills` (inert), state machine, hook mechanics.

Each file one concern; follow the Slice-1 component conventions and the skin cheat-sheet (color/font/motion tokens; raw px; no hex; Lucide only; `--mono` numerals).

---

## 7. Testing & verification

- Per-tab card render tests (Web/News/Discussions variants show domain/outlet/platform+engagement; Video shows derived thumbnail + channel, no duration).
- `honest-count` per-tab tests (web/news/discussions/videos wording + singular; academic unchanged).
- Tab-switch: selecting a non-academic tab refetches with the new `tab` and shows its caveat; academic shows the source chip and no caveat.
- Non-academic never renders "0 sources"; whole-tab-unavailable per tab; no-results per-tab copy + "Search Academic" switches tab.
- **Live verify** (under `op-run`, dev bypass): all five tabs return real results in the right card; screenshot Web + Videos. Tier 1 green (typecheck + lint + `pnpm test:run`); prettier scoped to authored paths.

---

## 8. Risks

- **Favicon privacy:** a remote favicon service would leak the browsed domain/query to a third party → default to a Lucide `globe` marker (no external call). (design.md is Lucide-only anyway.)
- **Video thumbnail id parsing:** derive the id robustly from the `watch?v=` url; fall back to no-thumbnail if absent (never a broken image).
- **Non-academic honesty regression:** the academic source-status/`matchedTotal` path must not run for non-academic (guard + tests) so no "0 sources"/fake-cap line appears.
- **Skin drift:** new cards pull from tokens/existing components; design.md §9 holds.

---

## 9. Not in this slice (roadmap)

- **2b** Source Side-peek (all tabs) · **2c** functional Sort/Time/Scope filters · **2d** mobile · **Slice 4** video reading-room + transcript affordance.
