# Projects · Library · Inbox — States Design Spec

Three sidebar destinations. Shell = the locked app shell (sidebar + topbar), main column top-aligned.
**Authorities:** `design.md` (skin) · `CRAFT-ADDENDUM.md` (§A tables/peek/hover-reveal/empty-states) · `STATE-INVENTORY.md`.
**Identity:** calm, ink-first, "your work, not a feature wall." Numerals `--mono`. No push, no badges-as-nagging (design.md: *quiet by default*).

---

## A. Projects

A **Project** = one research effort (a question/topic holding sources, claims, drafts, a Deep Research run, an SR). List → open into a workspace.

### List anatomy
- Header row: `Projects` (serif) + `New project` (ink primary) right.
- Optional sort/filter pills (`Recent · A–Z · Phase`).
- **Project row/card** — color **spine** (2px left, the project's hue — the *only* per-project color) · title (serif `--text-lg`) · goal (`--muted` one line) · meta (`{n} sources · {n} claims`, `--mono`) · **progress meter + phase** (e.g. `Screening · 62%`) · updated time · chevron. Hover-reveal: `Open · Rename · Archive`. Click → workspace.

### States
| State | Spec |
|---|---|
| Populated | List/grid of project rows, staggered entrance (Continuity ≤6). |
| Empty (first-run) | Empty-state-teaches-the-move: serif `Start your first project` + `--muted` `A project holds your sources, screening, drafts, and reviews in one place.` + `New project` CTA + a `or just search →` secondary. |
| Loading | Skeleton rows (spine + title bar + meta bar + progress bar as `--active`). |
| Error | Tomato `alert-triangle` `Couldn't load your projects` + `Try again`. |

### Project workspace (the inside)
Shell + a project header (spine, title, goal, phase) + a **tab bar**: `Overview · Sources · Claims · Draft · Review`. Each tab is its own surface (Sources = a Library-style table scoped to the project; Draft = the editor; Review = the SR funnel). Overview = the calm summary (counts, continue-where-you-left, the Deep Research run card if any). *(Workspace internals are their own spec; this doc locks the shell + tab-bar.)*

### Mobile
List = single column rows; `New project` = a bottom-right FAB or topbar `+`. Workspace tabs = a scrollable segmented control; each tab full-screen.

---

## B. Library (sources)

The user's saved sources — a **data-grid**, the canonical place to apply the tables craft (`CRAFT-ADDENDUM.md §A`).

### Anatomy
- Header: `Library` (serif) + `Add source ▾` (Upload PDF / Paste DOI / Import RIS) + search box + `Properties ▾` (column toggle) + `Sort ▾ · Filter ▾` + density toggle.
- **Table** — columns: `Title` (serif link) · `Authors` · `Year` (`--mono`) · `Journal` · `Quartile` (Q-chip) · `Type` (RCT/…) · `Added` (`--mono`) · `Tags`. Sticky header. Per-column header menu (sort/filter/freeze/hide). **Row hover** reveals actions (Cite · Add to project · Open · Remove) + a drag-grip is *not* needed (no manual reorder in v1). Click row → **source Side-peek** (full abstract, metadata, actions).
- Left rail (optional): saved filters / collections as views (Notion "saved views as tabs").

### States
| State | Spec |
|---|---|
| Populated | The table, N rows. |
| Empty | `Your library is empty` + `--muted` `Everything you save or import lands here.` + `Add source ▾` CTA + `Import from Zotero/RIS`. |
| Loading | Skeleton table rows (each cell a `--line2` bar; header instant). |
| Importing / adding | An inline row at top: `Importing 42 references…` progress (`--mono`), or a toast; new rows fade in (Continuity). Dedup note if duplicates found: `3 already in your library`. |
| Error | `Couldn't load your library` + `Try again`. |

### Mobile
Table → **card list** (title + authors·year + quartile chip); tap → full-screen source sheet; `Add source` = FAB; filters → bottom sheet. (A grid never squeezes on mobile — cards, per Notion mobile craft.)

---

## C. Inbox (activity / alerts)

The "what's new" digest — **quiet by default, never push.** New guideline matching a project, retraction alert on a library source, new citations in a saved search.

### Anatomy
- Header: `Inbox` (serif) + tabs `Following · All` + `Mark all read` (text button, right).
- **Feed item** — **trust dot** (functional color encodes kind: Jade new-evidence · Tomato retraction/alert · Amber caution · `--accent` AI-digest) · title (`--ink`) · detail (`--muted` one line) · source · time (`--mono`, right). Unread = subtle `--rail` fill + a small dot; read = flat. Hover-reveal: `Open · Mark read · Mute this alert`.
- Footer: `Quiet by default — no push notifications.` (identity line).

### States
| State | Spec |
|---|---|
| Populated | Grouped feed (Unread first, then earlier), staggered entrance ≤6. |
| Empty | `You're all caught up.` + `--muted` `We'll quietly collect new evidence, retractions, and citation alerts here — never a push.` (calm, not a dead end). |
| Loading | Skeleton feed rows. |

### Mobile
Single column feed; swipe-left on a row → Mark read / Mute; `Mark all read` in the topbar overflow.

---

## Motion (design.md §8, all three)
- List/feed/table entrance → **Continuity** (staggered ≤6, entrance-only).
- Row hover-reveal → **Status/micro** (opacity `--motion-micro`).
- Source Side-peek → **Orient** (`translateX(--motion-shift)`, `--motion-panel`).
- Import progress → **Status**; mark-read / add-to-project → **Feedback** toast (undo-window).
- `prefers-reduced-motion` → instant.

## Build order
Projects list (populated/empty/loading) → Library table (populated/empty/loading/importing) → Inbox feed (populated/empty) → mobile counterparts → project-workspace shell + tab-bar.
