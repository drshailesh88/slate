# Video Notes / Knowledge Extraction — States Design Spec (desktop + mobile + edges)

**Context:** a video is a **knowledge source**, not entertainment. From the search **Videos tab** (or a pasted URL, or a video saved to a project) the user opens a video and extracts a **segmented, timestamped transcript + rich structured notes**, plus **on-demand modes** for STUDY, RESEARCH, and CONTENT. This replaces today's thin `{summary, keyPoints, topics}` stub. It is the differentiator: *research any video into cited, structured knowledge that flows into the writing workspace.*

**Authorities:** `design.md` (skin — frozen) · `CRAFT-ADDENDUM.md` (in-editor composer, act-on-selection, agent legibility, universal generation action-row §B) · `STATE-INVENTORY.md` (coverage) · **Reference:** NotebookLM Web (Mobbin) — the 3-pane research model (**Sources | grounded-chat-with-numbered-citations | Studio artifacts**). *Steal the UX + craft, never the skin* — reskinned to ink/hairline; **no Google blue/green ever**.

**Principle:** the video becomes a **durable, cited knowledge asset**. **The timestamp is the atomic unit** — every note, concept, quote, and chat claim traces to a `mm:ss` moment. A note that can't be traced to its moment *is* the thin generic summary we're killing. Research-first; study/content secondary. Calm, editorial, scholarly — never a consumer chat app.

---

## 1. Layout — the reading room (desktop, 3-pane)

Adapt NotebookLM's 3-pane to a **video-centric** surface (single video, not a multi-source notebook):

| Pane | Contents |
|---|---|
| **Left — Video + Transcript** | Video player pinned top; below it the **segmented timestamped transcript** — each line prefixed with a `--mono` `mm:ss` chip, clickable → **seeks the video**. Current line highlights as it plays (Continuity). Search-in-transcript field (hairline). |
| **Center — Notes** (primary artifact) | The rich structured notes: **TL;DR** (serif) · **timestamped outline / chapters** · **key concepts** (`term — definition`, each with its `mm:ss`) · **notable quotes/claims** (blockquote + `mm:ss`). Every element carries its timestamp chip → seeks. |
| **Right — Studio** | The **on-demand modes** as generate-cards: Chat · Study (flashcards/quiz/guide) · Content (quotes/social/blog) · Mind map. Nothing here auto-generates — each is one tap, lazy. |

- **Panes divided by hairlines** (`--border`), no shadows, no gradients (§5, §9). Panes are resizable; center (Notes) is the default focus.
- **Reskin map:** NotebookLM chrome → our tokens — ink primary buttons (never colored), `--accent` only on AI/link affordances (timestamp chips, "Generate", citations), decision/state color only where it encodes state. Source Serif 4 titles · DM Sans body · **JetBrains Mono for every `mm:ss` and count** (§4). One icon family: Lucide (§7).

---

## 2. The atomic unit — the timestamp citation (the premium bar)

- Every note line, concept, quote, and chat answer carries a **`mm:ss` chip** — `--mono`, styled as an AI/link affordance (`--accent`), never decorative.
- **Click** → video seeks to that moment **and** the transcript auto-scrolls + highlights the line (**Orient** motion, §8.1).
- **Hover** → a quiet preview of the transcript line at that moment (**Feedback**; hover-reveal craft).
- This is NotebookLM's passage-citation, translated to **time**. It is non-negotiable: **every generated element MUST carry a timestamp** or it doesn't ship — that traceability is the whole difference from a generic summarizer.

---

## 3. Modes — M0 substrate (auto) + Studio (on-demand)

**M0 substrate — produced automatically on open, once, cached hard:**
- **Segmented timestamped transcript** (switch the Supadata fetch from plain-text to segmented).
- **Rich structured notes:** TL;DR · timestamped outline/chapters · key concepts + definitions · notable quotes/claims — all timestamped.

**Studio — generated lazily, only on user request** (never all up front — cost §):

| Cluster | Modes | Notes |
|---|---|---|
| **Research** (lead / moat) | **Chat-with-the-video** (grounded; every answer cites `mm:ss`) · **Cross-source synthesis** (this video + the user's library/papers) · **Cited claim/evidence extraction** | On-brand for an academic-writing product; no generic YT tool does the library synthesis. Chat needs the transcript embedded once. |
| **Study** (table-stakes) | Flashcards (Anki/CSV export) · Quiz (MCQ + explanations) · Study guide (outline + glossary + essay Qs) | Each is one cheap LLM pass over the transcript. |
| **Content** (secondary) | Key quotes/hooks · Social pack (X/LinkedIn) · Blog draft | Cheap text passes. |
| **Deferred / metered** | Clip candidates (video-native, expensive) · Audio overview (TTS) | Gate behind explicit action / premium; the only two that aren't near-free. |

Every Studio card: **idle** (label + `Generate`) → **generating** (Status motion on the card) → **result** with the **universal generation action-row** (CRAFT-ADDENDUM §B): `Copy · Insert into draft · Export · Regenerate`. "Insert into draft" is the bridge into the editor — the differentiator.

---

## 4. States (taxonomy × desktop + mobile)

| State | Spec |
|---|---|
| **Default / populated** | 3-pane (desktop): transcript loaded, notes rendered, Studio idle. Player top-left. |
| **Loading — two phase** | ① **Fetching transcript** (skeleton over transcript pane, `--muted` "Pulling transcript…"). ② **Distilling notes** (notes pane skeleton, "Distilling notes…"). Transcript can render before notes finish — never block one on the other. |
| **No transcript** (no captions) | Honest empty in the transcript+notes panes: `This video has no captions.` + one action `Transcribe it anyway` (Supadata/Whisper, **metered** — show the cost/quota line, never silent). |
| **Error / retry** | Transcript or notes fetch failed → inline card `Couldn't reach the transcript service · Retry` (Tomato only on the state, not chrome). Cached prior result stays readable (stale-if-error). |
| **Long video (chunked)** | Notes distilled in chunks → determinate **Status** progress: `Distilling 3 of 5 sections`. No silent truncation (today's 48k cap is the bug). |
| **Mode generating** | The tapped Studio card shows indeterminate Status; others stay idle. Result lands with the action-row. |
| **Quota / limit** | Supadata transcript quota or AI quota reached → honest row: `Transcription limit reached — resets {when}` / `Notes limit reached`. Degrade, never fail blank. |
| **Offline** | Cached transcript + notes are **readable**; Studio generate + video seek that needs network are disabled with a `--muted` "needs connection" hint. |
| **Interaction** | Transcript line: rest / hover (preview) / active (playing — highlighted). Timestamp chip: rest / hover (preview) / pressed (seeks). Chat: rest / typing (send fills ink) / streaming (grounded answer with citations appearing). |

---

## 5. Mobile (co-equal — designed together, not squished)

3-pane collapses to **video (sticky top, collapsible) + segmented tabs**:

| Element | Mobile form |
|---|---|
| **Player** | Sticky top, collapsible to a thin now-playing bar on scroll. Every `mm:ss` chip seeks it. |
| **Tabs** | `Notes · Transcript · Studio · Chat` (segmented control under the player). Notes default. |
| **Notes** | Single column; timestamped outline → concepts → quotes; chips seek the sticky player. |
| **Transcript** | Scrollable segmented lines; current line auto-scrolls with playback; tap → seek. |
| **Studio** | Modes as a tap-list → each opens **full-screen**; result gets the bottom-anchored action-row (`Insert · Export · ⋯`). |
| **Chat** | Full-screen grounded chat; answers cite `mm:ss` chips that seek the sticky player. |

---

## 6. Motion (§8 — only the four legal jobs)

- **Orient** — timestamp/citation click → video seeks **and** transcript scrolls-to + highlights the line (the connective motion of the whole surface).
- **Feedback** — timestamp/citation hover → transcript-line preview; Generate press.
- **Status** — Studio mode generation (indeterminate on the card); long-video chunk progress (determinate).
- **Continuity** — transcript current-line highlight advancing with playback.
Motion tokens from §8.2 only; `transform`/`opacity` only; honor `prefers-reduced-motion`; **no decorative entrances, parallax, bounce, ambient** (§9).

---

## 7. Entry points & IA (why this isn't a silo)

- **Search → Videos tab** → tap a result → opens this surface.
- **Paste a URL** via the composer `+` catalogue ("Add → video").
- **A video as a source in a project** — saved to the library, sits **alongside papers**; its **cited claims flow into Deep Research and the editor** (Insert into draft). This is the ScholarSync moat: a generic YT summarizer produces a throwaway blob; here the video's extracted, timestamped, cited knowledge becomes part of the research/writing workspace.

---

## 8. Build order (engine married to UI — no separate frontend/backend)

1. **M0 substrate** — segmented timestamped transcript + rich timestamped structured notes, replacing `study-notes.ts`'s thin `{summary,keyPoints,topics}`. Chunked for long video. *(backend, but shaped by the panes it feeds.)*
2. **Reading room** — Video+Transcript and Notes panes (desktop + mobile), timestamp-seek wired. The M0 output rendered in the frozen skin.
3. **Studio research trio** — grounded chat (cited), cross-source synthesis with the library, cited claim extraction.
4. **Study modes** — flashcards / quiz / study guide (cheap, expected).
5. **Content + deferred** — quotes/social/blog; clips + audio metered/premium.

**Coverage to add to STATE-INVENTORY.md:** a new `Video Notes` surface row with the states in §4 × desktop + mobile.
</content>
