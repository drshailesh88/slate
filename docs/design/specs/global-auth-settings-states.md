# Global · Auth · Settings — States Design Spec

Cross-cutting surfaces. **Authorities:** `design.md` (skin) · `CRAFT-ADDENDUM.md` (toasts §A, theme-picker §D, settings two-pane) · `STATE-INVENTORY.md`.
**Identity:** calm, ink-first, honest. Functional color only where it encodes state. Auth is Clerk-powered — **we never build credential entry** (design.md + security rules); the app renders Clerk's flow in our skin.

---

## A. Global / cross-cutting

| State | Spec |
|---|---|
| **Offline banner** | Thin top strip, `--maybg` fill / `--mayln` hairline: `● You're offline — cached work is readable; new searches need a connection.` Persistent while offline, auto-dismisses on reconnect (Feedback). Never blocks reading. |
| **Error boundary** (app broke) | Centered: Tomato `alert-triangle` in an `--excbg` circle · serif `Something went wrong` · `--muted` `The app hit an unexpected error. Your work is saved.` · `Reload` (ink) + `Report this` (secondary). No stack trace. |
| **404 / not found** | Centered: serif `We can't find that page.` · `--muted` `The link may be broken or the item moved.` · `Back to Home` (ink). Sidebar stays (it's still the app). |
| **Permission-denied** | Centered: Lucide `lock` · serif `You don't have access to this.` · `--muted` `Ask the owner for access, or head back.` · `Back` + `Request access` (secondary). |
| **Quota / limit reached** | `--conbg` (Violet, the CTA/plan color) card: `You've reached your {plan} limit — {used}/{limit} {unit}` (`--mono` meter) · `--muted` what's paused · **`Upgrade` (Violet primary)** + `Maybe later`. Non-blocking where possible (read stays, new runs pause). |
| **Toast / notification** | Bottom-anchored, `--paper` fill, hairline, `--r-md`, one line + optional action. **Stackable** (newest on top, ≤3 visible, older collapse). Reversible actions carry an **undo-window** (`Undone` ↔ `Undo`, ~8–10s, no circular countdown). Auto-dismiss ~5s; hover pauses. Enter/exit = **Feedback** (opacity + 8px slide). |
| **App-shell: collapsed** | Sidebar collapses to an **icon rail** (labels hidden, tooltips on hover); content reflows, doesn't jump (`--motion-panel`, translateX). Toggle in the sidebar head. |
| **App-shell: full-hide (focus)** | For focus contexts (editor, deep reading) the sidebar **fully hides**; a slim hover-zone / a floating `‹` re-reveals it. Topbar reduces to breadcrumb + Exit. |

---

## B. Auth (Clerk, in our skin)

Centered single card on `--paper`, ScholarSync wordmark above, generous whitespace, ink primary buttons, hairline inputs. We style the container; Clerk owns the fields.

| State | Spec |
|---|---|
| **Sign in** | Wordmark · serif `Welcome back` · Clerk email/password + OAuth (Google) rendered in our tokens (ink buttons, `--line` inputs, `--accent` links) · `New here? Create an account`. |
| **Sign up** | serif `Create your account` · Clerk fields · one line of value-prop `--muted` · `Already have an account? Sign in`. |
| **Splash / initial load** | Before auth resolves: centered ScholarSync mark + a quiet skeleton or a single `Status` shimmer line (`Setting up your desk…`), never a spinner. Resolves into Home (or Sign-in). |
| **Auth error** | Inline under the field (Clerk copy, our red `--exc`): actionable, e.g. `That email or password didn't match.` We never surface raw errors. |

---

## C. Settings

**Two-pane** (Notion craft): left nav list + right detail pane. Modal or full-page; light+dark parity.

- **Left nav:** `Account · Appearance · Sources & databases · Notifications · Plan & usage · Team` (Team only if applicable). Active row `--active` fill + ink; rest `--muted`.
- **Detail panes:**
  - **Account** — name, email (read-only display; changes go through Clerk, not us), `Sign out`. No password/credential fields rendered by us.
  - **Appearance** — **theme picker: `Light · Dark · System`** as **tiny live mini-screenshots** (Langdock steal, addendum §D), selected = `--accent` ring. Density default (Comfortable/Compact).
  - **Sources & databases** — the grounding picker: **curated "Popular" tier first, full catalog after** (addendum §D); per-source connect/status; connection = Jade `Connected` chip.
  - **Notifications** — the "quiet by default" controls: which alert kinds land in Inbox; **no push** — reinforced in copy.
  - **Plan & usage** — usage meters (`--mono`), what each tier unlocks, `Upgrade` (Violet). Honest usage, never dark-pattern nagging.

### States
Populated (default) · Loading (skeleton left-nav + pane) · Saving (inline `Saved` Feedback tick, per-field) · Error (inline, actionable).

### Mobile
Two-pane collapses to: nav list → tap → full-screen detail → back-chevron. Theme mini-previews stack.

---

## Motion (design.md §8, all)
- Toasts, saves, undo → **Feedback**.
- Sidebar collapse / full-hide, settings pane switch → **Orient/Continuity** (`--motion-panel`, translateX/opacity).
- Splash shimmer, loading → **Status**.
- Quota/error entrance → **Orient** (opacity + scale .98→1).
- `prefers-reduced-motion` → instant everywhere.

## Build order
Toast system first (used everywhere) → offline banner → error boundary / 404 / permission / quota → shell collapse + full-hide → Auth (sign-in/up/splash in our skin) → Settings two-pane (Appearance theme-picker, Sources tiering, Plan meters) → mobile counterparts.
