# Deep Research — States Design Spec (mobile + edges)

**Context:** the composer routing chip `Deep research` → **Clarifier → Running → Coverage → Report**. The four **desktop** states already exist in Paper (built by the search designer). This spec (a) folds the agent-legibility craft (`CRAFT-ADDENDUM.md §C`) into them, (b) specs the **mobile** counterparts, and (c) specs the **edge** states.
**Authorities:** `design.md` (skin) · `CRAFT-ADDENDUM.md §C` (thought-trace, reversible cards, scoped-access, "what happens next", persistent reasoning trace) · `STATE-INVENTORY.md`.
**Principle:** visible, never a black box. Transparent + interruptible at every step. Deep Research is a *mode inside search*, not its own destination — no agent builder (addendum §E).

---

## 1. The four core states + craft to fold in

### ① Clarifier — pin intent before the run
Existing: `DEEP RESEARCH ON {question}` · "What matters most?" cards (**Landmark trials / Latest evidence / Exhaustive**) · `Sources ▾` (corpus + N databases) · Date window · cost line (`~2–3 min · reads ~40 sources · leave and resume`) · **Run deep research →** (accent CTA).
**Fold in (§C):**
- **"What happens next"** — a 3-step `--muted` summary above the CTA: `Plan → search {sources} → screen → follow citations → write with inline citations`, so the user sees the shape before locking.
- **Scoped-access disclosure** — one collapsed row: `This run can read: your corpus · 5 databases · web` (chevron to expand to per-source None/Read). Shown once, before Run.

### ② Running — every step visible, interruptible
Existing: `Researching — {question}` · sub-line `{intent} · N sources · elapsed` · **Stop** (Tomato) · step list (Planned/Searched/Screened/Following-citations/Write) · **discovery meter** (`35 relevant found · discovery slowing`).
**Fold in (§C):**
- **Thought-trace** — each step gets a chevron-collapsed `Thought ›` line (`--muted`); expands to the actual query / tool call. Quiet until asked.
- **Reversible action cards** — recovered/added sources render as `Added ✓ {source}` on a hairline card with a Jade tick + `--accent` **Undo** — never a silent list mutation.
- Reasoning/plan stays **pinned** (persistent reasoning trace) — never swapped away as it progresses.

### ③ Coverage — the agent knows when to stop
Existing: `✓ Likely complete` · discovery-curve chart (plateau) · stats (`38 relevant · 6 landmark · ~96% est. coverage`) · `Search deeper anyway` (secondary) · `See the report →` (accent).
No new craft — this *is* the coverage disclosure. Keep the curve + the honest `~%`.

### ④ Report — every claim carries its citation
Existing: `✓ Every sentence checked against its source · 0 unsupported claims` (Jade banner) · serif Answer with inline `[n]` · Evidence list (`SUPPORTS`/`CONTRADICTS` tiers, RCT·journal·year, `--mono` citation counts) · hands to Writing.
**Fold in:** the **universal generation action-row** (addendum §B) at the foot: `Copy · Insert into draft · Export · Try again` — same row used everywhere AI output lands.

---

## 2. Mobile counterparts

Single column, full-width, bottom-anchored primary action. Deep Research on mobile is a **full-screen sequence**, not a side panel.

| State | Mobile form |
|---|---|
| **① Clarifier** | Full-screen form: question (serif) → the 3 intent cards **stacked** → `Sources` + `Date` as tap-rows opening bottom sheets → cost line → sticky bottom **Run deep research** (accent). "What happens next" collapsed above the button. |
| **② Running** | Full-screen live log: header (`Researching…` + Stop, sticky top) → step list scrolls → discovery meter pinned bottom. Thought-trace rows expand inline. |
| **③ Coverage** | Curve chart full-width → 3 stat cells in a row → sticky bottom `See the report` / `Search deeper`. |
| **④ Report** | Scrollable: Jade banner → Answer → Evidence list (cards stack; badges wrap) → sticky bottom action-row (`Insert · Export · ⋯`). |

---

## 3. Edge states (desktop + mobile)

| State | Spec |
|---|---|
| **Stopped / interrupted** | User hits Stop mid-run. Header → `Stopped · 24 of ~38 found so far` (`--mono`). Partial results are **usable**, not discarded. Actions: `Resume` (accent) · `Use what we have →` · `Discard`. Amber, not Tomato — it's a pause, not an error. |
| **Resume** | The run is resumable from a Home Recent row or Inbox: a `Resume` chip (Lucide `rotate-ccw`) on the project/run card → reopens Running at the saved step, thought-trace intact. Copy: `Left off at "following citations" · 1:12 elapsed`. |
| **No / low results (honest)** | Discovery finds few relevant: **do not fake a full report.** `Only 3 relevant papers found — the evidence base for this question looks thin.` → show the 3 → actions: `Broaden the question` · `Search the web` · `Report anyway (3 sources)`. Coverage % omitted or shown low with a caution. |
| **Source-degraded mid-run** | A source drops during the run. Inline in the step list (not a modal): `Scopus timed out — continued with 4 sources; coverage estimate adjusted.` (Amber dot). The run continues; the Coverage % accounts for it. Never silently drop it. |
| **Run error** | The run fails at a step. `The run hit an error while {step}. Your progress is saved.` (Tomato `alert-triangle`) → `Retry from here` (re-runs from the failed step, keeps prior results) · `Start over`. Nothing before the failure is lost. |

---

## 4. Motion (design.md §8)
- Step append (Running) → **Continuity** (opacity + 4–8px rise, staggered ≤6, never on re-render).
- Discovery meter / "thinking" → **Status** (the one licensed loop; nothing else loops).
- Thought-trace expand, state→state advance → **Continuity**.
- Reversible-card Undo, action-row → **Feedback**.
- `prefers-reduced-motion` → instant.

## 5. Build order
Fold §C craft into the 4 existing desktop artboards → build the 4 mobile → build the 5 edge states (desktop, then mobile where they differ). Reuse the running step-log + discovery-meter components across all.
