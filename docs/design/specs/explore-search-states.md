# Explore / Search — States Design Spec

**Surface:** the search-results surface the composer routes into (a plain search intent lands here; a *deep* run goes to the Clarifier instead). Real-app anchor: `src/components/explore/ExplorePageClient.tsx`.
**Authorities:** `docs/design/design.md` (skin), `docs/design/CRAFT-ADDENDUM.md` (peek/tables/hover-reveal), `docs/design/STATE-INVENTORY.md` (state taxonomy). **Reuse the search team's shipped pieces, don't reinvent:** `SourceStatus` (`src/lib/search/source-status.ts`), `JournalQuartileBadge`, `FilterPills`, `ScopeSelector`, the honest-count copy in `research/page.tsx`, and the per-tab "Temporarily unavailable" state.
**Cornerstone:** never silently show `0`; every count is honest; every degraded source is disclosed. Steal craft, skin is design.md.

---

## 1. Surface anatomy (main column, top → bottom)

Shell = the locked app shell (labeled sidebar + topbar), identical to Home. The main column is **top-aligned and scrolls** (not centered like Home).

1. **Search bar (topbar / first row)** — the current query, editable in place (refine without leaving). Full-width-ish, hairline `--line` box, `--r-lg`, Lucide `search` glyph left, the query text in `--ink`, ⌘K affordance right. Submitting re-runs search. Account stays in the sidebar.
2. **Result header row** (below search, `--s5` gap):
   - **Left — honest count line** (`--text-sm`, `--muted`, numerals `--mono`): `142 matched across 5 sources · showing the top 200`. Rules in §3.
   - **Right — source-status chip** + `Sources ▾` (which DBs). Rules in §3.
3. **Tab bar** — `Academic · Web · News · Discussions · Videos`. Active tab: `--ink` label + a 2px `--ink` underline indicator; inactive `--muted`. Web/News/Discussions carry a quiet quality marker (§3).
4. **Filter bar** (`FilterPills`) — `Scope ▾ · Sort: Relevance ▾ · Time: Any year ▾`, right-aligned; optional density toggle `Compact / Comfortable` (design.md §5, data-grids only). Pills = hairline chips, `--r-md`, Lucide `chevron-down`.
5. **Results** — vertical list of result cards (§2), hairline `--line2` dividers between, generous `--s5` row rhythm (calm) or tighter in Compact.

---

## 2. Result-card anatomy

### Academic (the reference card)
Row: main column (flex-grow) + trailing hover-actions (fixed slot).
- **Title** — Source Serif 4, `--text-lg` (16px), `--ink`, links to the source; 2-line clamp.
- **Meta line** — DM Sans `--text-sm` `--muted`: `Authors · Journal · Year`. **Year in `--mono`.**
- **Badge row** (`--s2` gap, `--s2` top):
  - **Quartile** — small chip, `--mono` label `Q1`…`Q4`, hairline border. Quality *tier*, not a decision → **monochrome**: Q1/Q2 `--ink` on `--rail`; Q3/Q4 `--muted`. (Reuse `JournalQuartileBadge`.)
  - **Study type / evidence** — hairline chip, `--text-label` sans: `RCT` · `Meta-analysis` · `Systematic review` · `Cohort` … `--ink3`.
  - **Citations** — Lucide `quote`/`chart` + `--mono` count `2,140`, `--muted`.
  - **Support/Contradict** *(only when Explore is scoped to a claim)* — this IS a relationship/decision → functional color: `Supports` = Jade (`--inc`), `Contradicts` = Tomato (`--exc`), `Mixed` = Amber (`--may`). Omit in plain search.
- **Snippet** — 2-line abstract clamp, `--text-body` `--muted`, `--s2` top.
- **Trailing hover-actions** (hover-reveal grammar, §A of the addendum — appear on hover only, `--motion-micro` opacity): `Save` (bookmark) · `Cite` (quote) · `Add to project` (plus) · `Open` (external-link). Touch: long-press → overflow.
- **Click anywhere on the card → source Side-peek** (addendum §A): list stays live behind; peek shows full abstract, full metadata, all actions, "add to project/library."

### Per-tab variants
- **Web / News / Discussions** — favicon/source + title + domain·date; snippet; no quartile/study-type (not scholarly). News adds outlet + timestamp; Discussions adds forum (Reddit/HN/StackExchange) + score/replies (`--mono`).
- **Videos** — thumbnail left, title + channel + duration (`--mono`), a "Transcript & takeaways" affordance (reuse `VideoTakeaways`).

---

## 3. Disclosure primitives (the heart of this surface)

- **Honest count** — never a fake total. If matched ≤ 200: `142 matched across 5 sources`. If matched > 200: `3,400 matched across 5 sources · showing the top 200 by relevance`. Numerals `--mono`.
- **Source-status chip** (from `SourceStatus` classes `ok|timeout|rate_limited|missing_config|error`):
  - All ok: `5 sources` (optional Lucide `check` `--muted`).
  - Degraded: `4 of 5 sources · Scopus temporarily unavailable` — Amber dot (`--may`), tooltip names the reason. **Never collapse a degraded source into a silent 0.**
- **Tab quality caveat** — Web/News/Discussions are measurably weaker than Academic (baseline 0% beat-or-tie vs Exa, `docs/web-search/SEARCH-AGENT-HANDOVER.md`). Mark them: a small `Beta` tag on the tab, and when selected a one-line note under the tab bar: `Web results are early — we're still tuning quality. Academic is our strongest.` Do **not** present them as equal-trust.
- **Routing-chip continuity** — if the user arrived via the composer routing chip, the search bar shows the interpreted query and the chip's scope, so the route is visible end-to-end.

---

## 4. States (desktop + mobile)

For each: what changes vs Populated. Shell + search bar + tab bar are always present (chrome renders instantly).

| State | Desktop | Mobile delta |
|---|---|---|
| **Populated** | The full §1–§3 layout, N result cards, staggered entrance (Continuity, cap ≤6). | Single column; tabs = horizontally scrollable segmented control; filter bar → a `Filters` button opening a **bottom sheet**; card actions in long-press overflow; peek → full-screen sheet. |
| **Loading** | Count line = skeleton bar; tab bar + filter bar present (instant); **result cards = skeleton rows** (title bar + meta bar + 2 badge chips + 2 snippet lines as `--active`/`--line2` blocks). §8 **Status** shimmer, never a spinner. | Same skeleton rows, single column. |
| **No results (genuine)** | Empty-state-teaches-the-move (addendum §A): serif line `No papers matched "SGLT2 in HFpEF" in Academic.` + `--muted` body `Try broader terms, widen the time window, or search the Web.` + **actions**: `Clear filters` · `Search the Web →`. Never blank. | Same, centered; actions stack. |
| **Source-degraded** | *Partial:* results from available sources **plus a calm Amber note** above the list: `Scopus is temporarily unavailable — showing results from the other 4 sources. Academic coverage is unaffected.` *Whole-tab down* (e.g., all web providers): the per-tab **"Temporarily unavailable"** state — Amber `cloud-off`, `Web search is temporarily unavailable. Academic is unaffected.` + `Retry`. Distinct from No-results. | Same; note is a full-width strip above results. |
| **Error** | Search failed entirely: Tomato `alert-triangle`, serif `Couldn't run that search`, `--muted` `Something went wrong on our end — your query is saved. Try again in a moment.`, `Try again` button (bordered, `refresh-cw`). Query preserved in the bar. | Same, centered. |

---

## 5. Interaction craft (from CRAFT-ADDENDUM.md)

- **Hover-reveal** card actions (§A) — never persistent.
- **Source Side-peek** (§A) on card click — Side default; Center for claim review; Full opens the full source/Reading-Room.
- **Filters/Sort** = per-column-menu-style dropdowns (§A tables craft): filter-as-you-type where a list is long; Esc closes.
- **Keyboard**: `J/K` move selection between results, `Enter` opens the peek, `S` save, `/` focuses the search bar, `Esc` closes peek. (Register in the future "?" shortcuts sheet.)
- **Density**: Comfortable (calm) default; Compact toggles row-height + snippet clamp for scanning.

---

## 6. Motion (design.md §8 jobs only)

- Results entrance / tab switch / filter apply → **Continuity** (staggered opacity+translate fade, cap ≤6, entrance-only).
- Loading → **Status** (skeleton shimmer, never bounce).
- Source Side-peek open/close → **Orient** (`translateX(--motion-shift)→0` + opacity, `--motion-panel`, ease-out).
- Save/cite confirmation → **Feedback** toast (bottom-anchored, undo-window, `--motion-base`).
- `prefers-reduced-motion` → all collapse to instant.

---

## 7. Copy deck (exact strings)

- Count: `{n} matched across {m} sources` (+ ` · showing the top 200 by relevance` when n>200).
- Degraded (partial): `{Source} is temporarily unavailable — showing results from the other {k} sources. Academic coverage is unaffected.`
- Whole-tab down: `{Tab} search is temporarily unavailable. Academic is unaffected.`
- No results: `No papers matched "{query}" in {Tab}.` / `Try broader terms, widen the time window, or search the Web.`
- Error: `Couldn't run that search` / `Something went wrong on our end — your query is saved. Try again in a moment.`
- Web caveat: `Web results are early — we're still tuning quality. Academic is our strongest.`

---

## 8. Build order (when Paper's live / for the engineer)

1. `Explore / Desktop / Academic — Populated` (the reference: card + badges + count + source-status + tabs + filters).
2. `… / Loading` (skeleton rows).
3. `… / No results`.
4. `… / Source-degraded` (partial note + whole-tab unavailable).
5. `… / Error`.
6. Mobile counterparts of each.
7. Per-tab card variants (Web/News/Discussions/Videos).
