# ScholarSync — Design State Inventory (coverage tracker)

**Purpose:** Every surface × every state, drawn in Paper for **desktop + mobile**, so the implementing agent copies exact layout/copy and never imagines a state. This file is the coverage map: `☐` = to draw, `✅` = drawn in Paper, `n/a` = doesn't apply.

**Canvas convention (Paper):** group by surface. Name every artboard `Surface / Platform / State` (e.g. `Home / Desktop / First-run`). Desktop states in one row, mobile states in the row below. Reference/interaction mocks (routing chip, catalogue) sit adjacent to their surface.

**Skin authority:** `docs/design/design.md` (frozen). Decisions log: `docs/design/research/2026-07-04-nav-pattern-research.md`.

**Written specs (design = spec).** The **entire app** is specified in `docs/design/specs/` — durable, engineer- and Fable-usable, not Paper-dependent:
- `home-states.md` · `composer-states.md` · `explore-search-states.md` · `deep-research-states.md` · `projects-library-inbox-states.md` · `editor-states.md` · `global-auth-settings-states.md`
- Paper artboards exist for Home + Composer (20) and Explore·Populated; the rest render from these specs when convenient.
- Adopted interaction craft: `docs/design/CRAFT-ADDENDUM.md` · reference corpus map: `docs/design/reference/SCREEN-CORPUS-INDEX.md`

---

## State taxonomy (checklist every surface must satisfy)
- **Data:** Default/populated · Empty/first-run · Partial · Max/overflow
- **Time:** Loading (skeleton) · Success · Error/retry · Offline
- **Search-specific:** No results (genuine) · Source degraded/unavailable · Low-confidence
- **Interaction:** Rest · Focus/typing · Filled · Disabled · Selected
- **Access:** First-run · Returning · Permission-denied · Quota/limit

---

## 1. Home (launcher)
| State | Desktop | Mobile |
|---|---|---|
| Returning · rest (composer empty) | ✅ | ✅ |
| First-run / empty (new user, no recents) | ✅ | ✅ |
| Loading (skeleton) | ✅ | ✅ |
| Error (couldn't load desk · retry) | ✅ | ✅ |
| Offline (cached, new search needs connection) | ✅ | ✅ |
| Time-of-day variants (morning/afternoon/evening) | ☐ | ☐ |

## 2. Composer (the agentic input — interaction states)
| State | Desktop | Mobile |
|---|---|---|
| Rest (dim send) | ✅ | ✅ |
| Typing (send fills ink) | ✅ | ✅ |
| Routing chip — Deep research | ✅ | ✅ |
| Routing chip — Systematic review | ✅ | ✅ |
| Routing chip — Write & cite | ✅ | ✅ |
| Routing chip — Screen papers | ✅ | ✅ |
| Routing chip — Make slides | ✅ | ✅ |
| `+` catalogue open (Add + verbs) | ✅ | ✅ |
| Attachment added (PDF / DOI / from library) | ✅ | ☐ (same pattern) |
| Clarify/nudge (weak query — nudge, never gate) | ✅ | ☐ (same pattern) |

## 3. Deep Research flow (extends search designer's work)
| State | Desktop | Mobile |
|---|---|---|
| ① Clarifier (pin intent) | ✅ | ☐ |
| ② Running (live plan + discovery meter) | ✅ | ☐ |
| ③ Coverage (discovery curve + %) | ✅ | ☐ |
| ④ Report (verified citations) | ✅ | ☐ |
| Interrupted / stopped | ☐ | ☐ |
| Resumed (leave & come back) | ☐ | ☐ |
| No/low results (honest) | ☐ | ☐ |
| Source degraded during run | ☐ | ☐ |

## 4. Explore / Search results (tabs: Academic · Web · News · Discussions · Videos)
| State (per active tab) | Desktop | Mobile |
|---|---|---|
| Populated (result cards, filters) | ☐ | ☐ |
| Loading (skeleton) | ☐ | ☐ |
| No results (genuine empty) | ☐ | ☐ |
| Source temporarily unavailable (degraded) | ☐ | ☐ |
| Error | ☐ | ☐ |
| Result card — quartile/evidence/support-contradict badges | ☐ | ☐ |
| Honest count line ("N matched · showing top 200") | ☐ | ☐ |

## 5. Projects
| State | Desktop | Mobile |
|---|---|---|
| Populated (list) | ☐ | ☐ |
| Empty (no projects yet) | ☐ | ☐ |
| Loading | ☐ | ☐ |
| Project detail / workspace | ☐ | ☐ |

## 6. Library (sources)
| State | Desktop | Mobile |
|---|---|---|
| Populated | ☐ | ☐ |
| Empty | ☐ | ☐ |
| Loading | ☐ | ☐ |
| Importing / adding source | ☐ | ☐ |

## 7. Inbox (activity / alerts)
| State | Desktop | Mobile |
|---|---|---|
| Populated (digest) | ☐ | ☐ |
| Empty (quiet by default) | ☐ | ☐ |

## 8. Editor / Manuscript (writing surface)
| State | Desktop | Mobile |
|---|---|---|
| Empty draft | ☐ | ☐ |
| Writing (populated) | ☐ | ☐ |
| In-editor composer — **Ask ⇄ Draft** toggle (lives HERE) | ☐ | ☐ |
| Citation inserted / hover | ☐ | ☐ |
| AI drafting into manuscript | ☐ | ☐ |

## 9. Settings
| State | Desktop | Mobile |
|---|---|---|
| Default | ☐ | ☐ |
| Account / plan / quota | ☐ | ☐ |

## 10. Global / cross-cutting
| State | Desktop | Mobile |
|---|---|---|
| Offline banner | ☐ | ☐ |
| Error boundary (something broke) | ☐ | ☐ |
| Permission-denied | ☐ | ☐ |
| 404 / not found | ☐ | ☐ |
| Toast / inline notification | ☐ | ☐ |
| Quota / limit reached | ☐ | ☐ |
| App shell — sidebar collapsed / full-hide (focus) | ☐ | ☐ |

## 11. Auth / entry
| State | Desktop | Mobile |
|---|---|---|
| Sign in | ☐ | ☐ |
| Sign up | ☐ | ☐ |
| Splash / initial load | ☐ | ☐ |

---

## Execution order
1. **Home** — finish all states (the reference set every other surface copies rhythm from).
2. **Composer** interaction states (routing variants, attachment, catalogue on mobile).
3. **Deep Research** mobile + edge states (extend the search designer's flow).
4. **Explore/Search** results states (the disclosure-heavy surface).
5. Projects → Library → Inbox → Editor → Settings → Global → Auth.

Draw desktop + mobile together per state. Check the box here as each lands.
