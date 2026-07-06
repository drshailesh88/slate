# design.md — Components & Interaction Craft (addendum)

**Status:** companion to the frozen `design.md`. It does **not** change the skin (tokens, type, color, borders stay exactly as §1–§8 define). It records the **interaction craft** — the component behaviours, states, and micro-interactions — we adopted from the reference corpus (`docs/design/reference/SCREEN-CORPUS-INDEX.md`), each re-expressed in *our* tokens and *our* §8 motion jobs.

**The rule that produced this doc:** *Steal the UX and the craft; never the UI skin.* Every pattern below came from a real app (Notion, Langdock, Superhuman, Confluence, Elicit) but carries **zero** of their colour, chrome, or emoji — only the behaviour, mapped to `--ink`/`--accent`/functional tokens and the four legal §8 motion jobs (**Orient · Status · Continuity · Feedback**).

**Color discipline reminder:** `--accent` = AI/link affordance only (routing chip, uncommitted AI draft, AI verbs). Functional colour (Jade/Amber/Tomato) = decisions/states only. Everything else ink on paper. Motion never introduces a new primitive — only §8's jobs, tokens, and `prefers-reduced-motion` collapse.

---

## §A — Structural UI craft

| Component | Adopted behaviour (design.md terms) | Motion | Source |
|---|---|---|---|
| **Side-peek (the missing pattern)** | Rows/items open as a **peek**, three sizes: **Side** (default — list stays live behind), **Center** (focused review), **Full page**. Replaces our all-modal habit. Source detail → Side; claim review → Center; Reading Room → Full. | `translateX(--motion-shift)→0` + opacity, `--motion-panel`, ease-out (Orient) | Notion databases/30,32 |
| **Tables / data-grids** | **Properties panel** with eye-toggle Shown/Hidden columns; **per-column header menu** (sort/filter/freeze/hide); **Board = group-by column + Hidden-groups rail**; **row actions + drag-grip reveal on hover only**. Applies to screening queue + evidence-extraction grids. | panel slide `--motion-panel`; column menu `--motion-micro`; hover reveal opacity `--motion-micro` | Notion databases (35-screen set) |
| **Sidebar** | Recursive **tree** (Project→ReadingSet→Note), **collapse-to-rail** toggle (content reflows, never jumps), **hover `+`/`…`** per row. | disclosure height-via-transform `--motion-base`; collapse `--motion-panel` | Notion sidebar-ia/01,02,03 |
| **⌘K palette** | **Time-grouped recents** + **facet chips** (source type / project / trust tier) + **"Ask across your Library" AI row** + **right-hand preview pane**; full arrow-key nav; Esc always closes. | modal opacity+scale .98→1, `--motion-panel`, ease-out; row highlight `--motion-micro` | Notion command-palette/01,02,03 |
| **Hover-reveal grammar** | Action icons + drag-grip appear on hover only, never persistent; touch parity = long-press/overflow. Our "Hover-Reveal Law." | opacity 0→1 `--motion-micro` | Notion databases/12, editor/16 |
| **Drag-handle gutter menu** | Block/row grip → menu with **"Ask AI" as the top row** (not buried): Turn into / Duplicate / Ask AI. | menu grow-from-trigger `--motion-base`, 8px shift | Notion editor/12,15 |
| **Slash `/` menu** | Filter-as-you-type, **markdown hints** (`#`,`##`), stable categories, **"Close menu esc" row always rendered**; our verbs (`/evidence`,`/claim`,`/citation`) lead "Suggested". | list entrance staggered, cap ≤6 (Continuity) | Notion editor/01-04 |
| **Empty states** | **Never blank** — every empty Room/Board/table shows one CTA row that teaches the next move. Our "Empty-State-Is-Onboarding Law." | — | Notion editor/17, page-furniture/07 |
| **Toasts** | Small, **bottom-anchored, stackable**, with an **undo-window** for reversible actions; no circular countdown (stays calm). | opacity + 8px slide, `--motion-base` (Feedback) | Notion + Superhuman |

---

## §B — AI-assist craft (composer, inline, act-on-selection)

| Component | Adopted behaviour | Motion | Source |
|---|---|---|---|
| **In-editor composer** (was backlogged `Ask⇄Draft`) | An **edit-bar docked to the block it edits** (not a floating tooltip/modal). State machine: **rest → typing → shimmer → draft rendered in-place in `--accent` (uncommitted) → Accept/Discard/Insert-below/Try-again → strip to `--ink` on accept.** The toggle earns its place only once a block/selection is targeted. | bar grows from block edge (Orient); shimmer (Status); accent→ink opacity-swap (Continuity) | Notion ai-inline-writing/02,05,15 |
| **Universal generation action-row** | *Every* AI output — side panel, inline, Deep Research report — ends in the **same fixed row of verbs** (Copy / Insert / Try again / …), never bespoke per surface. | row fades in with content, `--motion-base` (Feedback) | Notion ai-side-panel/03 |
| **Act-on-selection** (was unspecified) | Select text → **floating toolbar** (format icons + **Explain / Ask AI** as first-class verbs) → **grouped menu: Suggested (contextual) vs Edit (longer/shorter/tone/translate)** → **diff-view for edit-type transforms, outright replace for generate-type** (do NOT build one universal diff). | toolbar appear `--motion-micro` (Orient); submenu `--motion-base` | Notion ai-inline-writing/19,20,25; Superhuman editing-text-with-ai |
| **Regenerable AI block** | Anything that must stay **live/regenerable** (AI-filled evidence cell, recurring citation-check) = a persistent bordered container with **"Generated by AI · Update ▾"** header — distinct from prose that gets absorbed on accept. | shimmer in-box (Status) → Feedback on done | Notion ai-create-blocks/11, ai-databases-autofill/09 |
| **Ask-AI panel states** | Idle (greeting + suggestion chips + input) → typing → **"thinking" text-shimmer in the same bar (bar never resizes)** → answer + action row. | Orient in; Status shimmer; Feedback out | Notion ai-side-panel/02, ai-search-qa/05 |

---

## §C — Agentic legibility (Deep Research panel)

Make our **one** agent legible and trustworthy — adopt the *craft*, not a builder (see §E).

| Primitive | Adopted behaviour | Motion | Source |
|---|---|---|---|
| **Thought-trace** | Above each Deep Research step, a chevron-collapsed `--muted` line ("Thought ›") that expands to the actual query/tool call. Quiet until asked — a footnote, not noise. Turns the discovery meter into an auditable trail. | Continuity | Notion ai-agents-automation/03; Langdock reasoning trace |
| **Reversible action cards** | Every source/claim added during Running/Coverage reads **"Added ✓ [source]"** on a `--paper`/hairline card with a Jade tick + an `--accent` **Undo** link — never a silent list mutation. | Feedback | Notion .../04,05 |
| **Scoped-access disclosure** | Before a run touches Library/Projects/web, show **exactly what it can read**, once, collapsed by default (per-resource None/Can-view/Can-edit row list). | hover micro | Notion .../06 |
| **"What happens next"** | At Clarifier→Running, a 3-step summary of what the agent will do and roughly how long, before the query locks. | Orient | Notion .../21 |
| **Persistent reasoning trace** | The synthesis/plan stays **beside the canvas the whole time** — Clarifier/Coverage are never swapped away once the report exists. | Continuity | Langdock agents-workflows/15,17,18 |
| **Living-instructions page** | One global, readable/editable **"How ScholarSync's agent works"** transparency page (headed sections) — not per-agent personas/avatars. | — | Notion .../47-49 |

---

## §D — Langdock adds (differentiators worth stealing)

| Pattern | Adopt | Motion |
|---|---|---|
| **Live mirrored preview while configuring** | Any config surface (saved-search/skill authoring) shows the **real rendered end-state** in a right pane, never a summary. | Continuity |
| **Creativity slider** (Deterministic ↔ Creative) | Replace any raw temperature float with a **human-labeled continuum** — "recognize not remember." | Feedback |
| **Portable, inspectable skills** | Presets/skills ship as **user-inspectable text** (`SKILL.md`-style) with a source chip — matches our provenance rule (§6), never a black box. | — |
| **Curated-then-full tiering** | The Sources/grounding picker shows **"Popular" (curated DBs) first**, long tail after — essential-first. | Orient (static) |
| **Theme picker with live mini-previews** | Light/Dark/System picker uses **tiny real mini-screenshots**, not radio labels. | Feedback |
| **Per-action confirmation gates** | Any agentic write-action can carry a "Requires confirmation" gate with custom Loading/Done/Failed copy. | Feedback |

---

## §E — The scope guardrail (what NOT to adopt)

**Do NOT build a general agent/automation builder.** Notion/Langdock have one because they're general workspaces (arbitrary workflows across arbitrary tools). ScholarSync made the opposite bet: **one agent, "same everywhere, only output format changes"** (`docs/anti-frankenstein-doctrine.md`), with Deep Research a **mode inside search**, not a destination. A "create custom agent + avatar + trigger engine + marketplace" would recreate the "10 apps under one roof" disease the doctrine kills.

- **Adopt:** the legibility craft in §C (trace, reversible cards, ACL grid, consent flow, living-instructions).
- **Skip:** the builder itself — no "create custom agent" modal, no agent gallery/marketplace, no generic when/do rule engine, no per-agent avatars/personas.
- **Bounded fast-follow (not a builder):** a small fixed set of **read-only Deep Research pathway presets** ("Systematic review pathway," "Grant lit-review pathway") styled like template cards — never user-authored.

---

## The through-line

Across Notion, Langdock, Superhuman, Confluence, Elicit, one principle recurs and is now doctrine: **"visible, never a black box."** Routing chips, thought-traces, reversible cards, scoped-access disclosure, provenance chips — every AI action is shown before/as it runs. This is ScholarSync's trust posture, independently confirmed by the whole field.
