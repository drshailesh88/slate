# Home — States Design Spec

The post-login launcher. **Composer-led, no dashboard** — "primarily a research and writing tool; the composer is the main character (like Lindy/Langdock/Notion)." Everything else lives in the sidebar. Home + Composer are already drawn in Paper (20 artboards); this is the durable spec of record.
**Authorities:** `design.md` (skin) · `docs/design/research/2026-07-04-nav-pattern-research.md` (decision log) · `CRAFT-ADDENDUM.md` · `STATE-INVENTORY.md`. Composer detail → `composer-states.md`.

---

## 1. Anatomy (desktop)

- **Sidebar** (labeled, ~240px, never icon-only): `+ New project` (ink primary) → nav `Home · Projects · Library · Inbox · Settings` (Lucide, active = `--active` fill) → `RECENT` (capped list, grouped) → **account once, at the bottom** (avatar + name + plan, ChatGPT/Replit pattern). Collapse-to-rail + full-hide are global shell behaviours (`global-auth-settings-states.md §A`).
- **Topbar**: page label (`Home`) left; **⌘K search launcher** (magnifier + `⌘K` chip) right. No avatar here (account is in the sidebar).
- **Center** — **true-centered** (`justify-content:center`), calm: date label (`--mono` uppercase `--muted`) → **serif greeting** (`Good morning, Dr. Singh.`) → subtitle (`Your research desk — find, organize, draft, and check.`) → **the agentic composer** (`composer-states.md`). Nothing else. The composer is the single hero.

**Not on Home** (deliberate): no dashboard, no metrics, no "continue/your projects/what's new" walls, no scope chip, no `Ask⇄Draft` (that's the editor). Recents live in the sidebar; discovery lives in the composer's `+`.

---

## 2. States (desktop + mobile)

| State | Desktop | Mobile |
|---|---|---|
| **Returning · rest** | Greeting + composer (empty, dim send). Calm empty space below. | Greeting + composer; **bottom tab bar** (`Home·Projects·Library·Inbox·Settings`) = the mobile sidebar; account = topbar avatar. |
| **First-run / empty** | Greeting → `Welcome to your desk.` + onboarding subtitle + composer + **4 starter chips** (`Find evidence · Screen papers · Write & cite · Systematic review`) — the *one* place guidance chips live. Sidebar RECENT shows empty hint `Nothing yet — your searches and projects will collect here.` | Same; starters wrap 2×2; subtitle says "collects in the tabs." |
| **Loading** | Skeletons (greeting bars + composer block + sidebar-recent bars); chrome instant. §8 Status shimmer, never a spinner. | Same, single column. |
| **Error** | Center: Tomato `alert-triangle` · `Couldn't load your desk` · `Something went wrong on our end — your work is safe. Try again in a moment.` · `Try again` (bordered). | Same, centered. |
| **Offline** | Amber `● Offline · cached view` pill replaces the date; greeting stays; subtitle → `Your cached work is readable. New searches need a connection — reconnect to run anything new.`; composer present (send inactive). | Same; pill above greeting. |
| Time-of-day | Greeting swaps `Good morning/afternoon/evening` by local time. Text-only variant — not separate artboards. | — |

---

## 3. Motion (design.md §8)
- Recents entrance → **Continuity** (one quiet staggered fade, cap ≤6, entrance-only).
- Loading → **Status** (skeleton shimmer).
- Send dim→ink on type, offline pill → **Feedback/Continuity**.
- One hero moment max; `prefers-reduced-motion` → instant.

## 4. Copy deck
- Greeting: `Good {morning|afternoon|evening}, {name}.` · Subtitle: `Your research desk — find, organize, draft, and check.`
- First-run: `Welcome to your desk.` / `Start anything below — find evidence, screen papers, draft, or run a review. Your work collects in the sidebar.`
- Loading: `Setting up your desk…` · Error: `Couldn't load your desk` · Offline: `Offline · cached view`.

## 5. Status
Drawn in Paper: `Home / Desktop /{rest,first-run,loading,error,offline}` + `Home / Mobile /…` (10 artboards). This spec is the text of record.
