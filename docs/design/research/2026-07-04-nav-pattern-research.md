# Navigation Pattern Research — Web sidebar & mobile nav

**Date:** 2026-07-04
**Question:** For ScholarSync's shell, does the audience favour a **narrow icon-only rail** (~64px, our current build) or a **wider labeled sidebar** (~220–260px, icon+text)?
**Method:** 4 parallel researchers over the frozen Mobbin/Lazyweb corpora in `S_S_a_2/` (Notion, Elicit, Craft, Obsidian, Reflect, Covidence, Langdock, Linear, ClickUp, Otter, Kagi, ChatGPT, NotebookLM, Superhuman, Adobe CC, Microsoft 365 + IA-patterns).

## The avatar (the lens)
A **capable-but-uncertain academic** — has published papers but doesn't know how to run a systematic review; needs the process made *legible*, not done for them. **Returns for the feeling of being "at home."** Design principle: keep key choices **visible so they recognize rather than remember.**

## Verdict: UNANIMOUS — wider labeled sidebar, not an icon-only rail

Across all four clusters, **zero apps** use a bare icon-only rail as the sole desktop navigation for a multi-surface product.

| Cluster | Finding |
|---|---|
| **Notion + IA patterns** | Notion/Linear ship ~240–260px labeled sidebars; *fixed top* (Search/Home/Inbox pinned) + grouped collapsible sections; palette is the speed layer. IA-patterns doc: grouped, not flat, not dissolved. |
| **Research tools & workspaces** | Bimodal: evidence tools (Elicit/Covidence) = *no left nav*, one linear surface; workspaces (Craft/Reflect/Notion) = wide **labeled** sidebar (~230–260px). Craft is the closest template. |
| **AI assistants & search** | Even **Langdock** (chat-first) uses a ~210–230px **labeled** sidebar with feature destinations first, history *demoted*. Only bare icon rail in the corpus (ClickUp ~48px) is a workspace switcher beside a labeled panel. |
| **Pro & creative suites** | Adobe = icon **+ microlabel** (label baked in); Microsoft = no persistent icon rail; Superhuman = shortcut-memorization (power-user only). Icon-only never trusted as the sole persistent nav at scale. |

**Icon-only survives only** with (a) a permanent stacked label (Adobe) — at which point it isn't icon-only — or (b) total shortcut memorization (Superhuman) — a daily-power-user trade our avatar fails.

## Convergent patterns to steal
1. **Labeled destinations, ~220–260px width class** (Notion, Linear, Craft, Langdock).
2. **Fixed top block** in a stable position every session (Notion: Search/Home/Inbox) — recognition made literal.
3. **The nav is your-work, not a feature wall.** Content/objects, not 20 module rows (Craft, Notion).
4. **Essential-first, then faceted long tail** for many modules — rank the ~6–8 this project needs, group the rest under named categories; never a flat wall of 20 (Adobe).
5. **Command palette owns verbs/tools** → the sidebar stays a calm spatial map (Notion, assistants).
6. **Collapsible** to reclaim space (Notion's `«`) — default labeled, optional icon-only.

## Avatar fit — the load-bearing insight
> "The wider labeled sidebar isn't a density compromise — it's the at-homeness mechanism itself. 'I recognize the word Library' is what makes a user feel oriented; an icon rail turns every visit into a fresh decoding exercise."

The rail's *only* job is top-level orientation (the palette owns verbs). **Labels solve orientation; icons demand recall.** For a twice-a-year systematic-review user, the label must stay on screen by default.

## Mobile (contested — treat separately)
- **Bottom tabs (labeled)** for ≤5 destinations: Craft (5), Notion (4). ✅ matches our built mobile.
- **Drawer**: ChatGPT/Obsidian/Superhuman — the *history-led chat* pattern, for many/overflowing destinations.
- **Resolution:** our mobile has exactly 5 labeled destinations → **labeled bottom tab bar is correct and validated.** The drawer pattern is for chat-history apps, not our case.

## Implication for the flagship shell
The 5-destination IA (Home / Projects / Library / Inbox / Settings) is right — Notion/Craft/Linear all run 4–7 top items. **The mistake was the *width/labeling*, not the item count.** Recommendation: **default to a ~240px labeled sidebar, collapsible to the 64px icon rail** (the rail we already built becomes the collapsed state — nothing wasted). Mobile keeps the labeled 5-item bottom tabs.

## Provenance
Corpora: `~/S_S_a_2/{notion,elicit,research-workspaces,covidence,assistant-ux,kagi,superhuman,adobe-suite,microsoft-suite,ia-patterns}-screens/`. Researchers dispatched 2026-07-04.

---

# Round 2 — Broadened census (beyond Notion/Linear)

Second pass, 4 web-verified domain workers (~80 apps total across writing, academic/science + reference managers, legal, financial/market, AI-answer, PKM). Question refined: **icon-only vs icon+label**, and **do we need the collapse?**

## Icon-only vs icon+label — the count
- **Bare icon-only rail as PRIMARY nav: ~1 of ~80** (Google Keep — a Material note-jotter; inherited design system). Elsewhere a thin icon rail only appears as (a) a collapsed *state* with hover-labels (Linear, Perplexity), (b) a secondary action ribbon beside a labeled panel (Obsidian, Mendeley), or (c) a global app-switcher beside the real labeled nav (Slack, ClickUp).
- **Icon+label rail (legit minority):** Linear, Perplexity, Harvey, Craft, Ulysses, Bear, Apple Notes, Coda, Logseq, Consensus, Semantic Scholar, Zotero, Rayyan, Adobe (icon+microlabel). Skew newer / AI-first / ~5–8 items; labels always on.
- **Labeled-text sidebar (mainstream):** Google Docs, Word, Scrivener, iA Writer, ChatGPT, Poe, Koyfin, PitchBook, SciSpace, Paperpile, EndNote, + all PKM tools.
- **No left rail (top-bar / command / canvas):** Bloomberg Terminal, Lexis+, Bloomberg Law, Capital IQ, Hemingway, Kagi, Elicit, ResearchRabbit, Connected Papers, Litmaps, Covidence.

**Verdict:** icon-only is extinct as primary nav; icon+label is a valid minority; labeled-text is the norm. **Show words.**

## Collapse vs full-hide — the decisive split
- **Icon-collapse (shrink to glyph strip):** **0 of 21 writing tools**; a productivity-app-only pattern (Linear). A minority of AI/PKM tools offer it (Perplexity, Claude, Gemini, Tana, Capacities) — but keep hover-labels.
- **Full-hide (sidebar vanishes for focus):** **18 of 21 writing tools**; the universal focus affordance (Scrivener Composition, Ulysses Full Screen, Craft ⌘., Docs full-screen, Paperpile ⌘\, Zotero drag-to-zero). Clusters around the reading/writing surface, not general chrome.

**Verdict:** we do NOT need collapse-to-icons. We DO want **full-hide for focus**, scoped to editor/reader/deep-tool surfaces (not Home). Optionally keep one tiny global affordance when hidden (Obsidian split) — never a glyph rail.

## Decision (2026-07-04)
1. **Web nav = one labeled sidebar (~240px, icon+label).** Drop the 64px icon-rail state entirely.
2. **Focus = full-hide toggle (⌘\\)** in editor/reader/deep-tool contexts; sidebar persists on Home.
3. Sidebar = feature cap (Home/Projects/Library/Inbox/Settings) + your-work (Recent), all in text; ⌘K owns verbs/tools; modules live inside Projects/focus-mode (nav never grows).
4. Mobile = labeled bottom tabs (validated: Craft, Notion).

Sources: per-app doc/changelog/UX citations captured in the worker transcripts (`tasks/*.output`), plus NN/g recognition-vs-recall, Baymard icon findings.

---

# Search placement — decision (2026-07-04)

Second research sweep (4 web-verified workers, ~60 apps: research tools, command-palette conventions, writing/PKM, AI-answer + professional research).

## Findings
- **Content/literature search = center-hero** on Home: research tools 7/13 center; AI engines 7/8 center. The single legitimately search-box-shaped element.
- **Zero research tools run a separate ⌘K palette.** In workspace/pro tools the ⌘K entry has moved to the **topbar or shortcut-only** in every recent redesign (GitHub, Jira, Vercel, Slack, Arc); sidebar-top survives mainly in Notion/Linear/Attio.
- **The rule:** only ONE element on screen is ever search-box-shaped, and it's reserved for content search; wayfinding lives in a plainly-labeled sidebar that never looks like a search input.
- **Session-shape insight:** single-question tools afford a center hero (Home *is* the first question); multi-surface workspaces keep nav visible and demote command-search to peripheral chrome. ScholarSync is a hybrid — center composer atop existing state (Continue/Projects/What's-new) is correct.

## Decision
- **Literature search:** stays the **center composer** on Home (hero). ✅
- **Sidebar:** **pure labeled nav + Recent — no search box.** ✅
- **Command palette (⌘K):** a **ghost search icon in the topbar** (right, near avatar) — no text field. Opens a palette that finds your work (projects/papers/notes) + runs commands. "A-minimal."
- **Net:** exactly one search-shaped element (center = content); command search is a peripheral icon. Resolves the "search in nav AND top area" collision.
- Mobile: unchanged — content composer in body; nav via labeled bottom tabs; no keyboard palette needed.

## Addendum — avatar/account + search entry (corrected)
- **Account/avatar: one place only** — the account row at the **bottom of the sidebar** (Dr. Singh · plan). No topbar avatar. Matches ChatGPT/Replit/Notion (account bottom-left of sidebar). Evidence: user's Mobbin captures (Jira/Cloudflare put avatar top-right *instead*, never both).
- **Command ⌘K search: top-right of the topbar, alone** (icon + ⌘K chip). Not in the sidebar header (a brief detour there was reverted — search belongs out of the pure-nav sidebar per the earlier decision; the reason it moved (avatar gluing) is resolved by removing the duplicate topbar avatar).
- Net topbar: breadcrumb (left) + ⌘K launcher (right). Minimal, purposeful. Utilities (help/theme) can be added later if needed.

---

# Home composition — decision (2026-07-04): composer-led, no dashboard

Studied 11 reference homes (Perplexity, Claude, ChatGPT, Lovable, Replit, Stitch, Linear, Lindy, Fireflies, ElevenLabs, Cloudflare). Finding: the composer-led majority (8/11) keep the center = composer + a light layer of starters, and put **recent work in the sidebar**; only 3 (Fireflies/ElevenLabs/Cloudflare) are dashboards.

**Decision (user):** ScholarSync is primarily a research + writing tool — NOT a dashboard. The **composer is the main character** (like Lindy / Langdock / Notion). Everything else sits in the sidebar.

- **Home center:** centered greeting → composer (hero, ~760px, tall two-row: input + action row with Quick Look / Deep Research / Sources + ink submit) → light starter chips (Systematic review, Write & cite, Screen papers, Explore evidence). Nothing else.
- **Removed from center:** "Continue where you left off" hero, "Your projects" column, "What's new" column (was a dashboard).
- **Sidebar now carries everything:** `+ New project` (ink, top) → nav → **Recent** (= your projects AND continue-where-you-left-off, top item) → account (bottom).
- **"What's new"** → the **Inbox** nav item (badge).
- **Composer sizing:** the earlier 52px single-line bar was too small; reference hero composers are 100–180px two-row boxes (Perplexity/Claude/Lovable/Replit/Stitch). Fixed.

---

# Module exposure + search-hero — decision (2026-07-04)

Studied Kagi + 3 web-verified workers (module-exposure, search-hero aesthetics, niche tool-exposure).

## Module exposure — NO app-grid
- App-switcher grids (Google/MS/Adobe waffle) only fit when "products" are separate apps/domains. For routes inside one app (us), the norm is **sidebar + ⌘K** — Linear/Notion/Craft/Vercel/Perplexity ship exactly that and nothing else. MS demoted its own waffle in 2026.
- No niche tool uses a grid. SciSpace's sidebar-lists-all-8-tools = the "features-as-destinations" anti-pattern (avoid).
- **Kagi's transferable lesson = tabs-for-verticals (Academic/Web/News/Discussions) + settings-drawer — NOT the grid.** Our sidebar + ⌘K already is the launcher (search-first).
- **Decision: do not add an app-grid/launcher. Sidebar + ⌘K stands.**

## Search hero — premium spec (composer already ~on-spec)
The 7 moves: flat/hairline no-shadow · box radius 10–16px (pill/circle only for buttons) · true-center + whitespace · restrained brand moment (wordmark, no mascot) · one disclosure affordance not a toolbar at rest · verb-first placeholder · one subtle border-fade focus (no hue glow).
- Our composer already satisfies these (12px flat box, centered, verb-first, greeting as brand moment). 
- **Progressive disclosure:** Quick Look / Deep Research are MODES → keep visible (recognition, per Perplexity/v0). Sources is a FILTER → already a dropdown (the one Consensus-style reveal). Don't add more chips at rest.
- Ink-first guardrails: no mascot, no stadium bar, no gradient/hue focus glow, no multi-shadow. Focus = border darkening only.

Niche exemplars: **Consensus** (one box + one Filter affordance revealing scholarly filters) and **Perplexity** (Focus dropdown beside the box) — both validate our composer-led, progressive-disclosure home.

---

# Agentic composer — decision (2026-07-04): the composer is a hub

Researched Google I/O agentic search + AI engines (auto-route vs explicit), intent-routing in productivity tools, and the anti-black-box toolkit. Decision: the home composer becomes an **agentic intent-routing hub** — search + module-launcher + artefact intake in one box.

## The model
- **At rest:** one calm box + a **rotating placeholder** cycling real intents (Notion pattern), a `+` (hub), a send. Absolutely uncluttered. Placeholder default "What are you working on?".
- **Type an intent →** the composer interprets and shows a **routing chip BEFORE it runs** ("Will run → Slides · from 'X'"), which the user can tap to change. This visible routing is the **anti-black-box mechanism** (GPT-5's hidden router caused a backlash → OpenAI reverted to a visible mode label).
- **`+` (or ⌘K) = one catalogue, two halves:** **Add** (Upload a PDF / Paste a DOI / Add from Library — + drag-drop) and **Actions** (the ~20 modules, grouped Discover/Review/Write&Make/Check), searchable. Dropping a PDF is itself a routable intent.
- **Auto-route generative intent; keep navigation explicit** (sidebar + ⌘K). Don't force "open my library" through the agent.
- **Clarify before a long run** (ChatGPT gate before Deep Research).
- **Results surface shows the live plan/steps** (Perplexity) — that's the tool surface, not the home.

## Evidence
- Google AI Mode auto-routes because it's ONE intent type (answer). Perplexity/Gemini/Copilot use EXPLICIT modes because they span many task types. ChatGPT's silent router → backlash → visible toggle. **Lesson: across distinct tasks, surface the routing, never silent.**
- Notion = rotating suggestion chips over the box. ChatGPT/Gemini merged `+` and Tools into one menu (attach + actions).
- Slash `/` doesn't scale past ~8–10 → a ⌘K **palette** is the catalogue for 20 modules.

## Retired
- Composer mode chips (Quick Look / Deep Research / Sources) → dissolved into placeholder + `+` catalogue + routing chip.
- Below-composer starter chips → removed (redundant with the `+` catalogue; a third discovery surface = clutter).

## Reference states (Paper canvas)
"Composer ① Rest", "Composer ② Routing chip", "Composer ③ Catalogue" — document rest / routing / catalogue-with-Add.

## Gating reality (from code audit)
Modules are v2-gated (middleware hard-redirects); the composer's routed actions light up only with `NEXT_PUBLIC_ENABLE_V2_MODULES`. In v1 the box degrades to search alone.

---

# Composer SEND button — decision + design.md exception (2026-07-04)

Live Playwright inspection of real search/submit buttons (Google, Bing, DuckDuckGo, Brave, Startpage, Kagi, Perplexity; ChatGPT/Claude/Grok/Elicit/Lindy/Langdock login-walled, not DOM-inspected).

## Measured findings
- **Search engines** never use a circle send: Bing/Startpage = bare magnifier (0px, transparent), Google-classic = labeled rounded-rect (8px), DuckDuckGo = labeled pill (18px), Brave = Enter-only. That's the *keyword-search* model — not ours.
- **AI composers (verified n=2)** converge on a **solid circle**: Google AI-mode send `border-radius:9999px` 40×40; Perplexity submit `9999px` 32×32, near-black monochrome fill, single-color icon. (Measured examples used arrow-right; ChatGPT/Claude/Grok use arrow-up per user screenshots — unverifiable headless.)

## Decision
- **Composer SEND = solid circle**, ~36px, `border-radius: 9999px`, `aspect-ratio: 1`.
- **Monochrome ink fill + white arrow-up** (Lucide `arrow-up`). No accent, no multi-colour. (Slate-blue accent was tried and rejected — "plethora of colours"; ink-rounded-rect rejected — "black area"; the shape, not the colour, was the problem.)
- **Dim when empty → fills ink + white arrow when typed** (Perplexity/ChatGPT active/inactive pattern) so it's never a dark blob on an empty box.
- The `+` hub stays a neutral rounded-rect (ink plus).

## design.md exception (to add to design.md §5/§9)
> **Buttons are rounded-rect, never circular — with ONE exception: the composer submit ("send") button is circular.** It is a small, icon-only submit affordance where the circle is the measured, universal AI-composer convention (Google AI-mode, Perplexity, ChatGPT, Claude, Grok). This exception applies ONLY to the composer send; every other button remains rounded-rect.

---

# CORRECTION (2026-07-05): circle exception REVERSED — send stays rounded-rect

Elicit (our exact niche, agentic research composer) was inspected directly (user screenshots): its **send button is a ROUNDED-RECT** (~8px radius, accent fill, white arrow-right) — NOT a circle. Since the closest analog uses a rounded-rect and it reads fine, **we do NOT grant the circular-send exception.** design.md's "buttons are rounded-rect, never circular" stays fully intact.

- **Composer SEND = rounded-rect** (r-md 8px, ~40×34), **accent fill + white arrow** (Elicit-style). No design.md exception. Supersedes the 2026-07-04 circle decision above.
- Icon: Elicit uses arrow-right (submit→results flow); arrow-up is the chat convention — either defensible, pending user pick.

## Elicit's agentic composer (the pattern to adopt)
- A **visible, labeled mode selector** in the composer header: "Find papers ▾" → **TOOLS** (Find papers, Chat with papers, Extract data) + **WORKFLOWS** (Research agent, Report, Systematic review).
- Footer: **Source** scope dropdown (Research papers 138M / Clinical trials 500K) + rounded-rect send.
- Inline **validation hint** ("please ask a precise research question").
- Below composer: Resume + Suggested cards.
- **Lesson:** the agentic action selector is VISIBLE and grouped (Tools vs Workflows), not hidden behind `+` and not silently auto-routed — best for a recognition-over-recall avatar. Our `+` should evolve toward this visible selector; keep `+` for attach only.

---

# Home composer — LOCKED (2026-07-05)

Reconciled with the search-designer's Deep Research flow (Clarifier → Running → Coverage → Report, added to the Paper file). Final, minimal form:

```
              What are you working on?
[ + ]                                   [ ↑ ]      → routing chip on type → Clarifier
```

- **Input** — intent-agnostic "What are you working on?".
- **Quiet `+`** — Discover / Review / Write & Make / Check verbs + attach (PDF/DOI). One flat level.
- **Monochrome ink send** — rounded-rect (r-md), dim/light when empty → fills solid ink + white **arrow-up** when typed. NO colour. (Accent send was rejected: too Elicit-like + competes with real CTAs for the colour budget.)
- **Routing chip on type** — accent chip showing **route + scope** ("Deep research · your corpus + 5 databases"), editable. Quality-aware, per the search team's disclosure philosophy. Then monochrome **Start**.
- **Deep run hands to the Clarifier** — the composer flows straight into the search-designer's Clarifier (pin intent: Landmark/Latest/Exhaustive + Sources dropdown) → Running (live plan + discovery meter) → Coverage (discovery curve + ~% coverage) → Report (verified citations). One surface.

## Dropped from Home (deliberately)
- **`Ask ⇄ Draft` toggle** → backlog for the **in-editor composer**. At Home there's no open manuscript to write into, and research-vs-write is already covered by the routing chip / `+` verbs. It earns its spot only where "will it edit my document?" is live.
- **Scope chip** → NOT in the composer. Scope lives downstream in the Clarifier's "Sources" dropdown (avoids colliding with the 3 existing scope concepts: FilterPills Scope, ScopeSelector grounding, Elicit-style Source).

## Colour budget (confirmed against the search designer's flow)
Accent (--accent slate-blue) is spent on: the **routing chip**, **primary CTAs** ("Run deep research", "See the report"), **selected cards / active step**, and **decision signals**. NOT on the composer send. Ink-first holds.
