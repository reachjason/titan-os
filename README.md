# Titan · work log

A fast, keyboard-first work log. Type into the terminal bar at the bottom; tag it
with `/commands` anywhere in the line; it lands in a chronological feed. View as a
list, grouped by tag, or as a kanban board. Sign in with GitHub — your data is
private to your account and synced via Convex.

**Live:** https://www.trytitan.xyz

---

## Onboarding (clone -> run locally)

Local development uses a separate Convex dev deployment, so local testing no
longer writes to production data.

```bash
git clone git@github.com:reachjason/titan-os.git
cd titan-os
npm install
cp .env.local.example .env.local
npm run dev          # Convex dev + Vite -> http://127.0.0.1:5173
```

`npm run dev` runs `convex dev --start "vite --host 127.0.0.1"`. It selects the
dev deployment from `.env.local`, pushes local Convex functions/schema there, and
starts the frontend against the dev database.

Current local dev backend:

- Convex dev Cloud URL: `https://abundant-jaguar-978.convex.cloud`
- Convex dev Site/OAuth callback host: `https://abundant-jaguar-978.convex.site`
- GitHub OAuth callback:
  `https://abundant-jaguar-978.convex.site/api/auth/callback/github`

### What other contributors need

For normal local testing, a contributor only needs:

- repo access,
- Node/npm,
- a GitHub account for sign-in,
- `.env.local` copied from `.env.local.example`.

That path uses the shared dev Convex deployment and its already-configured
GitHub OAuth app. They do **not** need to create a GitHub OAuth app or set Convex
Auth env vars just to run the app locally.

For backend work in `convex/`, they also need access to the `viral-sangani /
titan-os` Convex project so `npm run dev` can push functions/schema to the dev
deployment. Without Convex project access, they can still run the frontend only:

```bash
npm run dev:frontend
```

If someone wants a private dev database instead of the shared dev database, they
need their own Convex dev deployment plus their own GitHub OAuth app, because a
GitHub OAuth App has a single callback URL. The callback must be:

```text
https://<their-dev-deployment>.convex.site/api/auth/callback/github
```

## Ship a change (push → it's live)

```bash
git checkout -b my-change
# ...edit...
npm run build        # optional local check: tsc -b && vite build
git commit -am "my change" && git push
# open a PR, or push to main → GitHub Actions deploys to https://www.trytitan.xyz
```

**Any push to `main` - by anyone - deploys automatically** (Convex backend +
frontend) via GitHub Actions. No Vercel or Convex login needed to deploy; the CI
secrets live on the repo. See `DEPLOY.md` for how the pipeline is wired.

---

## Architecture (1-minute mental model)

- **Frontend:** React + Vite, static build hosted on Vercel.
- **Backend:** [Convex](https://convex.dev) - real-time DB + serverless functions
  in `convex/`. Local development uses a separate Convex dev deployment.
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

### MCP access

Settings exposes a Titan MCP key for remote LLM clients. Open
`settings` -> `MCP access`, copy the endpoint and bearer header, then add them
to any MCP client that supports remote Streamable HTTP servers.

Production endpoint:

```text
https://www.trytitan.xyz/mcp
```

Authentication:

```text
Authorization: Bearer <Titan MCP key>
```

Do not put the key in the URL. Requests like `?api-key=...` are rejected because
query-string secrets can leak through logs, browser history, and referrers.

Generic remote MCP config shape:

```json
{
  "mcpServers": {
    "titan-os": {
      "type": "http",
      "url": "https://www.trytitan.xyz/mcp",
      "headers": {
        "Authorization": "Bearer <Titan MCP key>"
      }
    }
  }
}
```

Some clients name the transport `streamable-http` instead of `http`, or ask for
the header in a separate UI field. Use the same URL and bearer header either way.

Smoke test a key:

```bash
curl https://www.trytitan.xyz/mcp \
  -H "Authorization: Bearer <Titan MCP key>" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected result: a JSON-RPC response with `serverInfo.name` set to `titan-os`.

Available tools:

- `titan_profile_get` - profile, task tags, and entry counts.
- `titan_entries_search` - detailed search over visible entries.
- `titan_entry_get` - fetch one visible entry by id.
- `titan_tags_list` - tag counts and recent usage.
- `titan_collaborators_list` - collaborators visible through shared entries.
- `titan_entry_create` - create a new entry.
- `titan_entry_update_text` - replace entry text and reparse tags/mentions.
- `titan_entry_set_state` - update status, done, pinned, or order.

The MCP server can also list/read entry resources as `titan://entry/<id>`.

Access scope matches the app: the key can see entries authored by that user plus
entries where that user is mentioned. MCP keys are intentionally shown in
plaintext in Settings so they can be copied later; rotate or revoke the key from
the same panel if it is shared too widely.

Dev endpoint:

```text
https://abundant-jaguar-978.convex.site/mcp
```

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
