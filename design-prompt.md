# Design Brief — Titan OS (working name)

> **How to use this:** Paste this whole document into a design-focused Claude session. It is a complete brief to design the app end-to-end: a formalized design system plus every screen and state, in both dark and light themes. Treat the existing prototype (described below) as the baseline you are *polishing and systematizing* — not replacing.

---

## 1. What we're building (one paragraph)

A **keyboard-first quick-capture log** with light task tracking. You type into a command-line-style bar at the bottom of the screen and an entry lands instantly as a timestamped row tagged with a `/tag` (e.g. `/todo`, `/note`, `/idea`). Entries can be viewed chronologically, grouped by tag, or as a simple kanban board. It is fast, calm, and unobtrusive — closer to a terminal-meets-journal than to a heavy project-management tool. It's a hosted web app with Google sign-in; each user has their own fully private data.

## 2. Who it's for

Two startup founders (working in crypto/web3) who type fast and live in their keyboard. Each person signs in with Google and gets their **own separate, private space** — same hosted app, same database, but data is never shared between users. Design for a single focused user; there is **no collaboration, sharing, or multi-user UI** in this product.

## 3. Design philosophy (the guardrails)

This is the most important section. We have repeatedly over-built internal tools and then abandoned them. This time the rule is **ruthless minimalism**.

- **Capture in under a second.** The input bar is the hero. Nothing should sit between a thought and a logged entry.
- **Keyboard-first, mouse-optional.** Every primary action has a shortcut and a visible focus state. The app should feel great with hands never leaving the keyboard.
- **Calm, warm, quiet.** Muted palette, generous whitespace, no loud chrome, no badges screaming for attention.
- **Do not add features.** If a screen or control isn't listed in this brief, don't invent it. Resist dashboards, charts, projects, calendars, rich-text editors, settings sprawl.
- **Density with air.** Information-dense rows, but breathing room around them. Power-user content, beginner-calm layout.

North-star adjectives: **fast, focused, warm, minimal, founder's-tool.**

## 4. What already exists (the baseline to systematize)

A working prototype already has this. Your job is to formalize and refine it, not reinvent it.

**Global layout (centered single column):**
- A **top toolbar**: theme toggle (top-left, a half-filled circle), a **view switch** (list ⇄ board), a **sort/group control cluster** (sort descending, sort ascending, group-by-tag `#`, manual/custom order), a **search field**, an account/menu affordance, and a **settings** gear.
- A centered content column with a **day pill** ("Today") at the top.
- A **fixed bottom capture bar**: a `>` prompt, placeholder `Log… /tag to label`, and an `↵` submit button.

**Entry rows:** small leading dot (or checkbox for task tags), a colored **tag chip** (`/todo`, `/note`, `/idea`, `/urgent`, `/followup`, `/done`), the entry text, and a faint right-aligned **timestamp** (e.g. `8:42 AM`).

**Views:**
- **List** — reverse/forward chronological under the "Today" day pill.
- **Grouped by tag** — entries clustered under centered tag headers (`/done`, `/followup`, `/idea`, `/note`, `/todo`, `/urgent`).
- **Board** — three columns: **To Do**, **In Progress**, **Done**, with draggable cards and "Drop here" placeholders; column counts in the header.

**Settings modal (existing):** Dark mode toggle; Show timestamps (shortcut `t c`); Show tags (shortcut `t t`); **Task tags** editor (tags listed here get a checkbox — currently `/do`, `/todo` — with an "add a tag" field); Export JSON; Import JSON; Keyboard shortcuts button.

**Aesthetic (observed):** warm near-black/cream backgrounds, a coral/terracotta accent, **serif display headings** (e.g. "Today", "Settings", column titles), **monospace** for tags, the input, and timestamps, and a clean sans for entry body text. Color-coded tag chips. Both dark and light themes exist.

## 5. Your job in this pass

1. **Formalize the look into a real design system** — tokens, type scale, color, spacing, components, and every interaction state — so the build step is clean.
2. **Refine** the existing screens (sharper hierarchy, consistent spacing, better focus/hover/empty states) while keeping the current vibe unmistakable.
3. **Design the few missing screens** (auth, keyboard-shortcut overlay, empty/first-run states, tag autocomplete).
4. Deliver **dark and light** for everything.

---

## 6. Design system to define

### Color
Derive a token set from the existing warm palette. Approximate values below are pulled from the prototype — **refine them into a coherent, accessible system** (target WCAG AA for text), don't treat them as final.

**Dark theme (approx.):** background warm near-black `#171311`; raised surface `#211C18`; primary text warm cream `#F3ECE1`; secondary text `#B8AE9F`; faint text/timestamps `#6F665B`; hairline borders `#2C2621`; accent coral `#E08A6B`.

**Light theme (approx.):** background parchment `#F3EEE4`; surface `#FBF7EF`; primary text warm near-black `#2A2521`; secondary `#6B6358`; faint `#A39A8C`; borders `#E2DACd`; accent terracotta `#C8674A`.

**Semantic tokens** (define for both themes): `bg`, `surface`, `surface-raised`, `text-primary`, `text-secondary`, `text-faint`, `accent`, `accent-hover`, `border`, `focus-ring`, `overlay-scrim`.

**Tag colors** — six distinct, muted hues that read clearly as small chips in both themes (provide a chip background + text/label color for each, light and dark):
- `/todo` — rust / brown
- `/note` — blue / teal
- `/idea` — mustard / gold
- `/urgent` — red
- `/followup` — purple
- `/done` — green

Make tag chips support **arbitrary user-defined tags** too (people invent their own). Define a deterministic fallback palette so any new tag gets a stable, legible color.

### Typography
Three roles — define the families and a small scale:
- **Display / serif** — headings, the "Today" pill, column titles, modal titles. Warm, literary.
- **Monospace** — tag chips, the capture-bar input, timestamps, keyboard-shortcut keys.
- **Sans (body)** — entry text and UI labels. Clean and quiet.

Define sizes for: display-lg (modal/section titles), display-sm (column/day headers), body (entry text), mono-sm (tags/timestamps), caption (helper text in settings).

### Spacing, layout & radius
- Centered content column with a sensible max-width (~640–760px); comfortable row height and vertical rhythm.
- Fixed top toolbar and fixed bottom capture bar; scrollable content between.
- Define a spacing scale (4/8-based), corner radii (chips, cards, modal, buttons), and elevation/shadow for raised surfaces and the modal.

### Iconography & motion
- Minimal line icons, consistent stroke weight: theme toggle, list/board, the four sort/group controls, search, settings, account.
- Motion: subtle and quick (≤150ms) — entry insert, theme cross-fade, modal open, card drag. Nothing bouncy.

---

## 7. Components to define (with all states)

For each, document **default, hover, keyboard-focus, active/selected, and disabled** where relevant, in both themes.

- **Capture bar** — default, focused, typing, and a **`/` tag-autocomplete menu** (suggests existing tags as you type `/`).
- **Entry row** — standard; **task variant with checkbox**; **checked/completed** (strikethrough + dimmed); hover (reveal subtle row actions if any); selected (keyboard-highlighted).
- **Tag chip** — one spec, six named color variants + the generated-tag fallback.
- **Top toolbar** + **view switch** (segmented) + **sort/group cluster** (4 controls, with the active one highlighted).
- **Search field** — empty, focused, with query.
- **Day header pill** ("Today") and, if you design date navigation, prev/next-day affordances.
- **Board column** + **card** + **drag state** + **drop placeholder** + **empty column**.
- **Settings modal** — toggles/switches, the task-tag editor (chips with remove + add field), secondary buttons (Export/Import/Shortcuts).
- **Keyboard-shortcuts overlay** (new) — a clean reference sheet.
- **Buttons** (primary/secondary/ghost), **toggle switch**, **account menu** (avatar → sign out).
- **Empty states** and **toast/inline feedback** (e.g. "Exported", import error).

---

## 8. Screens & states to design (each in dark + light)

1. **Sign-in** *(new)* — minimal, on-brand: wordmark placeholder + a single "Continue with Google" button, one calm line of value-prop. No password fields.
2. **Main — List view** — populated, with the "Today" day pill.
3. **Main — Grouped-by-tag view**.
4. **Main — Board view** — populated, plus a card mid-drag.
5. **Capture in progress** — bar focused with the `/` tag-autocomplete menu open.
6. **Search active** — results filtered; and the **no-results** state.
7. **Settings modal** — refined version of the existing one.
8. **Keyboard-shortcuts overlay** *(new)*.
9. **Empty / first-run** — brand-new account, zero entries (make the empty capture bar inviting); plus empty board column.
10. **Account menu** — small popover with the signed-in user and "Sign out".

*(Date navigation across past days is optional — the "Today" pill implies it. If you design it, keep it to a quiet prev/next + a way back to Today.)*

---

## 9. Key interactions to reflect visually

- **Type-anywhere capture:** the bar is always one keystroke away; pressing `Enter` logs and clears it.
- **`/` opens tag autocomplete;** selecting or typing a known tag colors the chip live.
- **Task tags get a checkbox;** checking an item completes it (strikethrough, dim, optionally drifts to a done state).
- **Board drag-and-drop** between To Do / In Progress / Done.
- **Sort/group** toggles change the same data in place; **search** filters live.
- **Theme toggle** and the documented shortcuts (`t c` timestamps, `t t` tags) — surface these in the shortcuts overlay.
- **Strong visible keyboard focus** on every interactive element — this is a keyboard-first app, so focus styling is a first-class design concern, not an afterthought.

---

## 10. Scope guardrails — do NOT design these

To keep us from over-building again, explicitly **out of scope** for this pass: projects/folders, calendars or scheduling, due dates/reminders, recurring entries, analytics/charts/dashboards, rich-text or markdown editors, file attachments, notifications, any collaboration/sharing/assignee UI, and mobile-specific layouts (desktop/web only — just don't visually break if the window is narrowish).

## 11. Deliverables & format

Produce, in whatever this environment supports best (Figma frames or high-fidelity HTML/CSS mockups):

1. A **style/system sheet**: color tokens (both themes), type scale, spacing/radius, and the tag color set.
2. A **component sheet**: every component in section 7 with its states.
3. **High-fidelity mockups** of every screen in section 8, in **both dark and light**.
4. Brief **interaction annotations** where behavior isn't obvious (capture, autocomplete, drag, focus).

Organize it so it hands off cleanly to implementation (a later build step will turn these tokens/components into code).

## 12. North star

When in doubt, choose the calmer, faster, simpler option. The best version of this tool is one we actually open every day because logging a thought feels effortless. **Warm, focused, minimal — a founder's terminal-journal.**

---

### Appendix A — Tag set & meaning
`/todo` (a task to do) · `/note` (a fact/observation) · `/idea` (something to explore) · `/urgent` (needs attention now) · `/followup` (waiting on / circle back) · `/done` (completed). Users can also create their own tags. Tags in the **Task tags** list render with a checkbox.

### Appendix B — Toolbar legend (left → right)
Theme toggle · List/Board view switch · Sort descending · Sort ascending · Group by tag (`#`) · Manual/custom order · Search · Account menu · Settings.

### Appendix C — Settings contents
Dark mode · Show timestamps (`t c`) · Show tags (`t t`) · Task tags editor (add/remove tags that get a checkbox) · Export JSON · Import JSON · Keyboard shortcuts. *(Export/Import stays for data portability even though data is now stored per-user in the hosted database.)*
