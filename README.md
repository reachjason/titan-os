# Titan · work inbox

A fast, keyboard-first work inbox. Type anything into the terminal bar at the
bottom; tag it with `/commands` anywhere in the line; it lands in a chronological,
WhatsApp-style feed with date dividers. Click a tag to filter, search across text
and tags, edit or delete any entry. Everything is stored locally in your browser.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

## Use

- **Capture:** type and hit `Enter`. Tags can sit anywhere: `call vendor /urgent re /invoice`.
- **Tasks vs notes:** entries with a **task tag** (default `/do`, `/todo`) get a checkbox — check them off to fade + strike them. Other lines are plain notes. Edit the task-tag set in Settings.
- **Pin to top:** hover a row and click ★ to pin it into the **Pinned** focus section at the top.
- **History:** `↑` / `↓` walk through previous entries like a terminal. `Esc` clears the line.
- **Filter:** click any tag chip (click more to combine; toggle `match any` / `match all`). `Esc` clears.
- **Search:** top bar — matches body text and tags (`/todo` or `todo` both work).
- **List ↔ Board:** the `☰`/`▦` toggle switches between the list/inbox and a kanban board.
- **Board:** task-tagged entries are cards in **To Do · In Progress · Done**. Drag a card between columns to change status (dropping in Done checks it off / retags `/done`); drag within a column to reorder.
- **Sort / group:** the icon control toggles newest-bottom (`↓`), newest-top (`↑`), group-by-tag (`#`), manual (`↕`, drag the `⋮⋮` handle to reorder). In tag mode an entry appears under each of its tags. Sort + match + view persist across reloads.
- **Edit / delete:** hover a row for ✎ / ✕.
- **Settings (⚙):** dark mode, show/hide timestamps, task tags, export/import JSON, keyboard shortcuts.

### Keyboard shortcuts (press `?` for the in-app list)

| Key       | Action                            |
| --------- | --------------------------------- |
| `⌘/Ctrl K`| Search                            |
| `/`       | Focus the log bar                 |
| `S`       | Cycle sort / group                |
| `?`       | Show shortcuts                    |
| `Esc`     | Clear filters · cancel · close    |
| `↑` / `↓` | Previous / next entry (log bar)   |

## Customize — almost everything lives in [`src/config.ts`](src/config.ts)

| Want to change…            | Edit in `config.ts`                          |
| -------------------------- | -------------------------------------------- |
| App name / tagline / icon  | `brand`                                      |
| Add or recolor a `/command`| `commands` (one line each: `{ name, hint, hue }`) |
| Placeholder & button text  | `ui`                                         |
| Confirm-on-delete, autoscroll | `ui`                                      |
| Keyboard shortcuts         | `shortcuts`                                  |
| Colors (light & dark)      | `theme.light` / `theme.dark`                 |
| Storage keys (separate inboxes) | `storage`                               |

Colors are injected as CSS variables at startup, so editing a hex value in
`config.ts` re-skins the whole UI — no CSS hunting. Structural CSS lives in
`src/styles.css`; fonts are loaded in `index.html`.

## Project layout

```
src/
  config.ts            ← edit me first
  App.tsx              top-level wiring
  components/          Feed, EntryRow, TerminalBar, TagChip, DateDivider, Settings
  commands/registry.ts derives commands + chip colors from config
  lib/                 parse (tags), dates (dividers/timestamps), applyTheme
  store/               useEntries (localStorage), useTheme
```
