# Composer — States Design Spec (the agentic hub)

The heart of the app: an **agentic intent-routing composer** — search + module-launcher + artefact intake in one box. The user types intent; the composer interprets and shows a routing chip *before* it runs. Drawn in Paper (rest · typing · routing · catalogue · attachment · clarify-nudge · mobile routing + catalogue); this is the spec of record.
**Authorities:** `design.md` · `docs/design/research/2026-07-04-nav-pattern-research.md` (the full decision log) · `CRAFT-ADDENDUM.md §B` · `STATE-INVENTORY.md`.

---

## 1. Anatomy

A single calm box (hairline `--line`, `--r-lg`, flat) with:
- **Input** — rotating/placeholder `What are you working on?` (intent-agnostic; teaches by example).
- **`+` hub** (left, bordered ghost) — one menu, two halves:
  - **Add:** `Upload a PDF · Paste a DOI · Add from library` (drag-drop too).
  - **Actions:** the verbs grouped `Discover · Review · Write & Make · Check` (the ~20 modules), one flat level (never nest — Gemini's two-deep is the anti-pattern).
- **Send** (right) — **monochrome ink, rounded-rect** (`--r-md`, ~36px), Lucide **`arrow-up`**. *Dim/light when empty → fills solid ink + white arrow when there's text.* Never accent, never a circle, never black-on-black. (See §4 decisions.)

---

## 2. States

| State | Spec |
|---|---|
| **Rest** | Empty box, `+` (light), **dim light send**. The whole discovery surface is the `+` catalogue + rotating placeholder — no starter row on the returning Home. |
| **Typing** | Text entered → **send fills solid ink** (white arrow-up), one high-emphasis beat. No routing chip yet. |
| **Routing chip** | On a recognized intent, an **accent chip** appears above the action row: `Will run [✦ {Route} ▾] · {scope}` — route **+ scope** (e.g. `Deep research · your corpus + 5 databases`), tappable to change. Then a monochrome **Start**. Variants: Deep research · Systematic review · Write & cite · Screen papers · Slides — same chip, different route/scope. Anti-black-box: the route is shown before anything runs; generative routes also carry a quiet confidence signal; navigation never routes through the agent. |
| **`+` catalogue open** | The Add/Actions menu (desktop = anchored panel; mobile = bottom sheet). Grouped, searchable, Lucide icons, ink-monochrome rows. |
| **Attachment added** | A file chip in the box (`▤ EMPEROR-Preserved.pdf · 2.4 MB · ✕`); a dropped/attached PDF is itself a routable intent (Extract data · Summarise · Add to library). Same box, no separate uploader. |
| **Clarify-nudge** | A weak query gets an inline Amber nudge (`● A specific question finds better evidence — e.g. "…"`) but **send stays enabled (ink)** — coach, never gate. An uncertain researcher may submit an imperfect first pass and refine after results. |

---

## 3. The handoff (composer → downstream)

- **Plain search intent** → the Explore results surface (`explore-search-states.md`).
- **Deep run** → **Start opens the Clarifier** (pin intent: Landmark/Latest/Exhaustive + Sources) → Running → Coverage → Report (`deep-research-states.md`). Composer + that flow are **one continuous surface**.
- Scope is **not** a composer chip — it lives downstream in the Clarifier's Sources dropdown (unifies with `ScopeSelector`; avoids a 4th "scope" concept).

---

## 4. Locked decisions (why it looks like this)

- **Rounded-rect send, not a circle** — design.md's "no circular buttons" holds; Elicit (our niche) and Perplexity's web composer both ship rounded-rect sends. The earlier circle-exception was **reversed**.
- **Monochrome ink, not accent** — a colored send reads Elicit-ish and competes with the real CTAs for the color budget; ink-first wins. `--accent` is spent on the **routing chip** + primary CTAs, not the send icon.
- **arrow-up** (user pick; ChatGPT/Claude/Grok convention).
- **No `Ask⇄Draft` on Home** — no manuscript to write into yet; it lives in the editor (`editor-states.md`).
- **`+` is a hub, not just attach** — merges Add (intake) + Actions (verbs), like ChatGPT/Gemini's merged menu.

---

## 5. Motion (design.md §8)
- Send dim→ink → **Feedback** (opacity). Routing chip appear → **Orient** (grows from input). `+` menu open → **Orient/Continuity**. Placeholder rotation → **Continuity** (opacity crossfade). `prefers-reduced-motion` → instant.

## 6. Copy deck
- Placeholder: `What are you working on?` · Routing: `Will run · {Route} · {scope}` · Start: `Start →` · Nudge: `A specific question finds better evidence — e.g. "…".`

## 7. Status
Drawn in Paper: `Composer /{Typing, Routing variants, Attachment, Clarify-nudge, Mobile — Routing, Mobile — Catalogue}` + `Composer ①②③` reference states. This spec is the text of record.
