# ScholarSync — Design Reference Screen Corpus (index)

**What this is:** a durable map of the **real-app screen corpus** we tore down to inform ScholarSync's UI. **1,898 screens across 11 apps**, harvested from Mobbin/Lazyweb, each with a `manifest.json` and (mostly) a distilled `*-analysis.md`. This is our **design memory** — come back to it whenever a UI/craft decision needs a reference.

**The cornerstone rule (never violate):** **Steal the UX and the craft — never the UI skin.** These screens inform *flows, interaction patterns, and motion*. Every pixel we ship is **`docs/design/design.md`** (ink-first, hairline, Source Serif/DM Sans/JetBrains Mono, Lucide, §8 motion). What we *adopted* from this corpus is recorded in **`docs/design/CRAFT-ADDENDUM.md`**.

**Where it lives:** the corpora are on this machine at **`~/S_S_a_2/<app>-screens/`** (large image sets — *not* committed to the repo). The portable, committed knowledge is each corpus's distilled `*-analysis.md`. To go deep, open individual `.webp` with the Read tool.

**How to use it:** ① read the corpus's `*-analysis.md` (distilled) → ② check `CRAFT-ADDENDUM.md` for what we already adopted → ③ open specific `.webp` frames for pixel detail → ④ re-skin any pattern into design.md tokens.

---

## The corpus (all under `~/S_S_a_2/`)

| Corpus | Path | Screens | Covers | Best reference for OUR… | Analysis doc |
|---|---|---:|---|---|---|
| **Notion** | `notion-screens/` | 434 | Editor, databases (35), sidebar-IA, ⌘K palette, page-furniture, templates, settings, mobile | Sidebar, ⌘K, tables/grids, hover-reveal, slash, peek, empty-states, toasts | `notion-ux-analysis.md` |
| **↳ Notion AI/agent panel** | `notion-screens/ai-agent-panel/` | *(subset, 16 surfaces)* | AI side-panel, ai-chat, ai-search-qa, ai-inline-writing, ai-create-blocks, ai-actions, ai-databases-autofill, ai-meeting-notes, **ai-agents-automation (49)**, ai-mobile | In-editor composer, act-on-selection, Deep Research agent legibility | manifest + README |
| **Langdock** | `langdock-screens/` | 76 | chat-assistant/composer, agents-workflows (builder + canvas), prompts-library, skills, integrations-sources, knowledge-workspace, settings | Composer, agentic surfaces, live-preview-while-configuring, source tiering | manifest + README |
| **Covidence** | `covidence-screens/` | 142 | The leading **systematic-review** tool: dashboard, import, T&A, full-text, conflicts/consensus, RoB, extraction, PRISMA/export, team | **The SR module** (screening, conflicts, extraction) | `covidence-workflow-analysis.md` |
| **Elicit** | `elicit-screens/` | 86 | find-papers, screening, extraction, evidence-matrix, sr-workflow, report-notebook, chat-with-papers, library | Literature search, evidence matrix, our niche | `elicit-ux-analysis.md` |
| **Superhuman** | `superhuman-screens/` | 791 | Keyboard-first email: composer, AI-edit, formatting, search, ask-AI, motion craft | **Motion/craft gold standard**, keyboard-first speed, composer polish, act-on-selection | README |
| **Assistant-UX** | `assistant-ux-screens/` | 64 | Cross-tool AI-workspace patterns: entry/invocation, surface-form, agentic-multistep, grounding-citations, act-on-content, suggestions-modes | Composer, agentic affordances, citations/grounding | `assistant-ux-analysis.md` |
| **IA-patterns** | `ia-patterns-screens/` | 135 | Cross-app information-architecture patterns | Navigation, sidebar, page structure | `ia-patterns-analysis.md` |
| **Research-workspaces** | `research-workspaces-screens/` | 37 | Research/knowledge tools | Library, projects, workspace | `research-workspaces-analysis.md` |
| **Kagi** | `kagi-screens/` | 21 | Search engine craft | Search results, scope, calm search | `kagi-ux-analysis.md` |
| **Adobe suite** | `adobe-suite-screens/` | 69 | Pro creative-tool patterns | Dense pro UI, panels, toolbars | README |
| **Microsoft suite** | `microsoft-suite-screens/` | 43 | Office/productivity patterns | Docs, ribbons, enterprise patterns | README |

*(Vendored, committed copies of the SR-relevant subsets live in `docs/systematic-review/reference/ux-steal/` for the Fable SR build — see `docs/systematic-review/FABLE-5-BUILD-BRIEF.md`.)*

---

## Consult-when quick map (our surface → best corpus)

- **Home / composer** → Langdock (composer), assistant-ux, Superhuman (composer polish), Notion ai-side-panel.
- **⌘K palette** → Notion command-palette, Superhuman search.
- **Sidebar / nav / IA** → Notion sidebar-ia, ia-patterns.
- **Tables / screening / evidence grids** → Notion databases (35), Covidence, Elicit evidence-matrix.
- **Side-peek / drawer** → Notion databases (row-as-peek: Side/Center/Full).
- **In-editor composer + act-on-selection** → Notion ai-inline-writing, Superhuman editing-text-with-ai, assistant-ux act-on-content.
- **Deep Research agent (legibility)** → Notion ai-agents-automation (thought-trace, reversible cards, scoped-access), Langdock agents-workflows (reasoning trace beside canvas).
- **Systematic Review module** → Covidence (primary), Elicit sr-workflow.
- **Motion / micro-interaction feel** → Superhuman, then map onto design.md §8 jobs.
- **Empty / loading / error craft** → Notion (empty-state-teaches-the-move); our own `docs/design/STATE-INVENTORY.md` for the canonical patterns.

---

## Provenance
Harvested via the Mobbin/Lazyweb MCPs (see each `manifest.json` for `mobbin_url` + capture date). Notion base + adjacents captured 2026-06-26; Notion AI/agent-panel (301) + Langdock (76) captured 2026-07-05. Every file verified as real, non-zero pixels; every note written from viewing the actual screenshot.
