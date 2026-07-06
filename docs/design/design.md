# ScholarSync — `design.md` (canonical design system)

**Status:** FROZEN · single source of truth for all reskinning
**Last updated:** 2026-06-30
**Token values:** extracted verbatim from the ratified prototypes in `./reference/` — this file can never drift from what was blessed.
**Visual ground truth:** `./reference/editor-manuscript.html` and `./reference/systematic-review.html` (open in a browser).

> **If you are an AI reskinning wireframes: read §10 first, then apply §2–§9 to every screen. Do not invent values. Every color, font, radius, and motion duration must come from this file.**

---

## 1. Identity (the non-negotiables)

- **Thesis:** *Notion × Elicit* — Notion's calm block/workspace UX + Elicit's research-reasoning. Craft lineage: **Bear × Raycast × Superhuman**. Visually distant from all of them; the identity is ours.
- **"Ink is the brand."** ~95% grayscale. There is **no chromatic brand color**. The primary action is solid **ink**, never a colored accent.
- **Functional color only** (Superhuman rule): a saturated color may appear *only* when it encodes a state or decision (include/maybe/exclude, conflict, AI/link). If a pixel isn't a decision, an AI/link affordance, or a state, it is ink or hairline.
- **Calm, editorial, scholarly** — hairline borders, tight radii, generous whitespace, **no heavy shadows, no gradients**. A clinical-grade research instrument, not a consumer chat app.
- **Mobile is co-equal.** Every surface gets a real mobile design, designed together with desktop — never "desktop then squished."

---

## 2. Color tokens — LIGHT (default theme) — paste-ready

These are the exact values used by the blessed prototypes. Drop straight into `:root`.

```css
:root{
  /* Ink (text + primary action) */
  --ink:#1A1D21;      /* primary text + primary button bg */
  --ink2:#23262B;     /* near-ink, headings on raised */
  --ink3:#3a3f47;     /* tertiary ink */
  --muted:#9098a3;    /* secondary / placeholder / metadata */

  /* Surfaces & lines (cool, near-white) */
  --paper:#FCFCFD;    /* page background */
  --rail:#F8F8FA;     /* sidebars / rails */
  --line:#E4E5E9;     /* hairline border / divider */
  --line2:#EEEFF2;    /* fainter divider */
  --active:#ECEDF0;   /* selected/active row */

  /* Accent — AI features + links ONLY (slate-blue, restrained) */
  --accent:#3D5A80;
  --accentbg:#ECF0F5;
  --accentln:#C9D5E3;

  /* Functional / decision colors — use ONLY to encode a state */
  --inc:#2F6F4F; --incbg:#E7F0EA; --incln:#BCD6C6;  /* Include / verified / success (Jade) */
  --may:#8A6D3B; --maybg:#F3ECDD; --mayln:#E0D2B4;  /* Maybe / caution / highlight (Amber) */
  --exc:#9B4A3A; --excbg:#F2E3DF; --excln:#E2C4BB;  /* Exclude / retracted / error (Tomato) */
  --con:#7A4A86; --conbg:#F0E8F3; --conln:#DEC9E4;  /* Conflict / decision-required (Violet) */
}
```

| Role | Token | Hex |
|---|---|---|
| Page background | `--paper` | `#FCFCFD` |
| Rail / sidebar | `--rail` | `#F8F8FA` |
| Hairline border | `--line` | `#E4E5E9` |
| Primary text / ink | `--ink` | `#1A1D21` |
| Secondary / muted | `--muted` | `#9098A3` |
| Accent (AI/links only) | `--accent` | `#3D5A80` |
| Include (Jade) | `--inc` / `--incbg` | `#2F6F4F` / `#E7F0EA` |
| Maybe / Highlight (Amber) | `--may` / `--maybg` | `#8A6D3B` / `#F3ECDD` |
| Exclude (Tomato) | `--exc` / `--excbg` | `#9B4A3A` / `#F2E3DF` |
| Conflict (Violet) | `--con` / `--conbg` | `#7A4A86` / `#F0E8F3` |

**Lineage:** every value maps to a [Radix Colors](https://www.radix-ui.com/colors) scale (Slate neutrals; Jade/Amber/Tomato/Violet functional). When you need a value not listed, pick the nearest Radix step — never hand-pick a hex.

---

## 3. Color tokens — DARK (optional theme)

```css
:root[data-theme="dark"]{
  --paper:#0E0F11; --rail:#121316; --line:#292B30; --active:#1E2024;
  --ink:#ECEDEF; --ink2:#E2E3E6; --muted:#9BA1AC;
  --accent:#8BA6C9; --accentbg:#1A2230;
  --inc:#5FB389; --may:#D8B66A; --exc:#E08A78; --con:#B79BD0;
}
```

---

## 4. Typography

All three families are **OFL-licensed**, loaded from Google Fonts.

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet">
```

```css
:root{
  --serif:'Source Serif 4',Georgia,'Times New Roman',serif;     /* headlines & page/section titles */
  --sans:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; /* body & all UI */
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; /* data, IDs, counts, numerals */
}
```

Rules:
- **Serif (Source Serif 4)** → page titles, section/H1–H3 headlines, report/manuscript prose titles. Weight 600/700. **Never** serif body text.
- **Sans (DM Sans)** → body, labels, buttons, all UI chrome.
- **Mono (JetBrains Mono)** → every number, count, ID, DOI, n, effect size; right-aligned in tables.
- **Section labels:** UPPERCASE, ~11px, letter-spaced, `--muted`, sans.

---

## 5. Spacing, radius, borders, elevation

- **Radii:** 6–8px is the default for controls/cards; 9–12px for larger containers; 3–4px for chips/inline. Pills (`20px`) only for status tags. **Buttons are rounded-rect, never circular.**
- **Borders:** 1px hairline `--line`. Borders carry structure — **not shadows**.
- **Elevation:** flat. No drop shadows on cards; at most a 1px hairline + a barely-there `0 1px 2px rgba(0,0,0,.04)` if separation is essential.
- **Whitespace:** generous. Density is opt-in (Compact toggle) on data grids only.

---

## 6. Component rules

- **Cards:** `--paper` (or `--rail`) fill, 1px `--line` border, 6–12px radius, no shadow.
- **Buttons:** **primary = solid `--ink` + white label**, ~8px radius. Secondary = white/`--paper` + 1px `--line`. **Never a colored primary button.**
- **Chips / tags:** `--rail` fill, hairline border, tight radius, sans label, optional Lucide icon. AI/source chips use `--accent` (`--accentbg` fill, `--accentln` border).
- **Decision controls** (vote / screening status): the **one** place saturated color lives — Jade/Amber/Tomato keycaps, always paired with a text label (never color alone). AI-suggested value is *ringed*, never pre-selected.
- **Provenance:** every AI-produced value carries a source chip (e.g. `✦ Elicit`). "Not reported" is a designed dashed state, never blank.
- **Numbers:** `--mono`, `--muted`, right-aligned in tables.

---

## 7. Icons

**One family only: [Lucide](https://lucide.dev)** (MIT, thin, consistent). No mixed icon styles, no emoji decoration. Domain-specific scientific glyphs are exceptions only where Lucide genuinely lacks one.

---

## 8. Motion

> **"Motion is the brand's restraint, in time."** Motion follows the same law as color (§1): it only appears when it *does a job*. If a movement isn't doing one of the four jobs below, it is decoration — and decoration is forbidden. The aesthetic is **calm, fast, near-invisible**. For ScholarSync, *"nice animation!"* is a **failure signal**, not a win — good motion is felt, not noticed.

### 8.1 The four legal jobs

A motion is allowed **only** if it does one of these. Name the job or delete the motion.

| Job | What it does | Examples |
|---|---|---|
| **Orient** | Show where something came from / went | drawer slides from the edge it lives on; menu grows from its trigger |
| **Feedback** | Acknowledge the user's action | button press, toggle, row select, copy-confirmed |
| **Continuity** | Connect two states so nothing "teleports" | list reorder, content swap, tab change, expand/collapse |
| **Status** | Show the system is working | skeleton loader, subtle in-flight shimmer on AI values |

No job → no motion. Decorative entrance flourishes, parallax, looping ambient movement, attention-grabbing bounces: **banned** (they fight the "clinical research instrument" identity).

### 8.2 Motion tokens — paste-ready

Drop into `:root`. Never hand-pick a duration or curve — reference these the way you reference color tokens.

```css
:root{
  /* Durations — short. Calm UIs move quickly and get out of the way. */
  --motion-micro:160ms;   /* hover, press, toggle, focus ring */
  --motion-base:220ms;    /* content appear, chip/tag, list item, expand/collapse */
  --motion-panel:300ms;   /* drawers, modals, sidebars, route/page transitions */

  /* Easing — ONE family. Enter on ease-out, exit on ease-in, reorder on ease-inout. */
  --ease-out:cubic-bezier(0.22, 1, 0.36, 1);   /* default — things entering & settling */
  --ease-in:cubic-bezier(0.4, 0, 1, 1);        /* things leaving */
  --ease-inout:cubic-bezier(0.4, 0, 0.2, 1);   /* things moving/reordering in place */

  --motion-shift:8px;     /* slide travel for enter/exit — small; calm UIs move a little */
  --motion-stagger:40ms;  /* delay between items in a list/grid entrance */
}
```

### 8.3 Property & amount rules

- **Animate `transform` and `opacity` only.** Fades and small slides. Never animate color, width, height, or `top/left` (it looks cheap and janks). Expand/collapse uses height via `transform`/grid, not animated `width`.
- **One hero per screen, max.** At most one slightly-special moment per view; everything else is quiet utility motion. Three things competing for the eye = salad.
- **Stagger sparingly.** Lists may stagger entrance by `--motion-stagger`, but cap the total: never stagger more than ~6 items, and never on every re-render — entrance only.
- **AI/decision motion stays subtle.** AI provenance and Jade/Amber/Tomato decision controls (§6) may use a quiet status shimmer or ring; they must **never** bounce or pulse for attention.

### 8.4 Accessibility (non-negotiable)

Honor the OS setting. Every animation must collapse to an instant (or opacity-only) change under reduced-motion:

```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{ animation-duration:.01ms !important; transition-duration:.01ms !important; }
}
```

### 8.5 The three tests (use these instead of "designer eyes")

Before keeping any motion, run all three. Any fail → cut it.

1. **Job test** — Can you name the job (Orient / Feedback / Continuity / Status)? If not → decoration → delete.
2. **Break test** — *"Would I notice if it broke?"* should be **yes**. *"Would I say 'nice animation'?"* should be **no**.
3. **Subtraction test** — Turn it off. If the screen feels the same → it was salad → leave it off. Add motion back one at a time, never all at once.

### 8.6 Implementation

- **CSS transitions** for state changes (hover, press, expand, theme). Default reach-for.
- **[Motion](https://motion.dev) (formerly Framer Motion)** for orchestrated entrances, list `layout` reordering, and shared-element/route transitions — using the tokens in §8.2 (`duration`, `ease`), never ad-hoc values.
- Lineage / north star: **Linear, Notion, Vercel** motion — restrained and fast. Study tasteful web motion at [emilkowal.ski/ui/great-animations](https://emilkowal.ski/ui/great-animations). *Avoid* springy/playful consumer-app motion; it clashes with the identity.

---

## 9. Hard rules (do NOT break)

1. **No purple / teal / blue brand accent.** Ink is the brand. (Kill any `#6D28D9`, Notion `rgb(55,53,47)` ink, Google-blue, scattered blues.)
2. **Color only encodes meaning** — decision, state, or AI/link. Otherwise ink or hairline.
3. **Serif for titles, sans for body, mono for data.** Never serif body.
4. **One icon family (Lucide).**
5. **Primary buttons are ink, not colored.**
6. **No raw hex in screen code** — reference tokens from §2/§4 only.
7. **Default theme is COOL (Slate).** The warm "Manuscript" look (Sand + oxblood) is an *optional one-tap theme*, NOT the default — do not reskin to warm.
8. **Motion only does a job** — Orient, Feedback, Continuity, or Status (§8.1). No job → no motion. No decorative entrances, parallax, bounce, or ambient looping.
9. **No raw durations or easing in screen code** — reference the motion tokens in §8.2 only. Animate `transform`/`opacity` only; honor `prefers-reduced-motion`.

---

## 10. Reskin instruction (give this to Codex)

> Reskin each wireframe to ScholarSync's frozen design system in `docs/design/design.md`. Replace all colors with the `:root` tokens in §2 (light) — primary buttons solid `--ink`, accent `--accent` for AI/links only, saturated color only on decision/state controls per §6. Apply the typography in §4 (Source Serif 4 titles, DM Sans body, JetBrains Mono for all numerals). Use radii/borders from §5 (hairlines, no shadows, no gradients). Apply motion per §8 — only the four legal jobs, motion tokens from §8.2, `transform`/`opacity` only, `prefers-reduced-motion` honored; no decorative animation. One icon family: Lucide. Obey every rule in §9 — especially: no chromatic brand color, ink-is-the-brand, cool default (not warm), motion-does-a-job. Do not invent values; if something isn't covered, match the nearest pattern in `docs/design/reference/*.html`, which is the rendered ground truth. Preserve each wireframe's layout/IA; change only the skin.

---

## 11. Provenance

- **Foundation spec (the *why*):** `docs/superpowers/specs/2026-06-26-design-foundation-design.md` *(in the design-foundation worktree)*
- **Reverse-engineering evidence:** Mobbin/Lazyweb corpora — Notion, Elicit, Kagi, IA-patterns
- **Council rulings (ratification):** `docs/superpowers/council/2026-06-26-*-ruling*.md`
- **Reference prototypes (this folder):** `./reference/editor-manuscript.html`, `./reference/systematic-review.html`
