# Titan · work log

A fast, keyboard-first work log. Type into the terminal bar at the bottom; tag it
with `/commands` anywhere in the line; it lands in a chronological feed. View as a
list, grouped by tag, or as a kanban board. Sign in with GitHub — your data is
private to your account and synced via Convex.

**Live:** https://www.usetitan.xyz

---

## Onboarding (clone → run in ~1 minute)

Everything you need is in the repo. **No accounts, keys, or env setup required to
run locally** — the committed `.env` already points at the production backend.

```bash
git clone git@github.com:reachjason/titan-os.git
cd titan-os
npm install
npm run dev          # → http://localhost:5173
```

Open it, click **Continue with GitHub**, and you'll see your own (empty) log.
Running locally talks to the **same production Convex backend** as the live site,
so be mindful: local edits hit real data (scoped to your own GitHub account).

> Using an AI agent (e.g. Claude Code)? Just say "run the app" — it knows the setup
> from `CLAUDE.md`.

## Ship a change (push → it's live)

```bash
git checkout -b my-change
# ...edit...
npm run build        # optional local check: tsc -b && vite build
git commit -am "my change" && git push
# open a PR, or push to main → GitHub Actions deploys to https://www.usetitan.xyz
```

**Any push to `main` — by anyone — deploys automatically** (Convex backend +
frontend) via GitHub Actions. No Vercel or Convex login needed to deploy; the CI
secrets live on the repo. See `DEPLOY.md` for how the pipeline is wired.

---

## Architecture (1-minute mental model)

- **Frontend:** React + Vite, static build hosted on Vercel.
- **Backend:** [Convex](https://convex.dev) — real-time DB + serverless functions
  in `convex/`. **Single production deployment, no dev** (see `CLAUDE.md`).
- **Auth:** Convex Auth with **GitHub**. Each user's entries are private + isolated.
- **What's in Convex:** entries (per user). **What's local (localStorage):** theme,
  show timestamps/tags, task-tag set, sort + list/board view — per-device, instant.
- **Config:** `src/config.ts` is the single source of truth for brand, slash
  commands, copy, shortcuts, and theme colors.

```
src/
  config.ts            ← brand, commands, theme colors
  App.tsx              auth gate (SignIn / Workspace) + top-level wiring
  components/          Feed, EntryRow, TerminalBar, TagChip, Board, Spotlight,
                       SignIn, AccountMenu, Settings/Help modals, Toast
  store/               useEntries (Convex), usePrefs + useTheme (localStorage)
  lib/                 parse (tags), dates, applyTheme
convex/
  schema.ts            entries table (per-user) + auth tables
  entries.ts           list / add / update / remove / toggleDone / … (auth-gated)
  auth.ts, http.ts     Convex Auth + GitHub provider
```

## Use

- **Capture:** type and hit `Enter`. Tags can sit anywhere: `call vendor /urgent re /invoice`.
- **Tasks vs notes:** entries with a **task tag** (default `/do`, `/todo`) get a checkbox — check them off to fade + strike them.
- **Pin to top:** hover a row and click ★ to pin it.
- **List ↔ Board:** the `list` / `board` toggle switches between the feed and a kanban board.
- **Board:** task-tagged entries are cards in **To Do · In Progress · Done**. Drag a card between columns (dropping in Done checks it off); drag within a column to reorder.
- **Sort / group:** the glyph control toggles newest-top (`↓`), newest-bottom (`↑`), group-by-tag (`#`), manual (`⇅`, drag to reorder).
- **Search:** press **⇧F** (or click `⌕ ⇧F`) for the Spotlight palette — live-filters across text and tags.
- **Edit / delete:** hover a row for ✎ / ✕.
- **Settings (`settings`):** dark mode, show/hide timestamps, task tags, export/import JSON, keyboard shortcuts.

### Keyboard shortcuts (press `?` for the in-app list)

| Key           | Action                          |
| ------------- | ------------------------------- |
| `⇧F`          | Spotlight search                |
| `/`           | Focus the log bar               |
| `v`           | Toggle list / board             |
| `?`           | Show shortcuts                  |
| `Esc`         | Close / clear / cancel          |
| `↑` / `↓`     | Previous / next entry (log bar) |
| `t c` / `t t` | Toggle timestamps / tags        |

## Customize

Almost everything visual lives in [`src/config.ts`](src/config.ts): app name/mark,
slash commands, placeholder/button copy, keyboard shortcuts, and the light/dark
theme colors (injected as CSS variables at startup). Structural CSS is in
`src/styles.css`; fonts load in `index.html`.
