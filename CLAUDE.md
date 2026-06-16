# Titan OS — project guide for AI agents & contributors

> **READ THIS FIRST.** This project is **PROD-ONLY**. There is exactly one Convex
> deployment and everyone — including local development — uses it.

**Live:** https://www.usetitan.xyz · deploys on every push to `main` (GitHub Actions).

## ⛔ The one rule: PROD-ONLY, no dev deployment

- The single Convex deployment is **production**: `robust-grasshopper-674`
  - Cloud URL: `https://robust-grasshopper-674.convex.cloud`
  - HTTP/Site URL: `https://robust-grasshopper-674.convex.site`
- **NEVER run `npx convex dev`.** It would spin up / use a separate *dev*
  deployment, which we deliberately don't use. Ignore the old dev deployment
  (`abundant-jaguar-978`) entirely — it is abandoned.
- `.env.local` pins `CONVEX_DEPLOYMENT=prod:robust-grasshopper-674`, so the Convex
  CLI targets **prod by default**. You do **not** need a `--prod` flag.

This is a small personal project used by ~3 people. The dev/prod split is
intentionally collapsed to one environment to avoid overhead.

## How to work on this project

### Frontend (React + Vite)
```bash
npm install
npm run dev          # http://localhost:5173 — talks to the PROD Convex deployment
npm run build        # tsc -b && vite build  → dist/
```
The Vite app reads `VITE_CONVEX_URL` from `.env.local` (the prod `.cloud` URL).
Running locally connects to prod data, so be mindful: **local edits hit real data.**

### Backend (Convex functions in `convex/`)
There is no watch mode against prod. To apply backend changes, **deploy**:
```bash
npm run convex:deploy        # = `convex deploy` → pushes schema + functions to PROD
```
After changing anything in `convex/` (schema, queries, mutations), run this to make
it live. It also regenerates `convex/_generated/` (committed to the repo).

Other Convex commands (all target prod via `.env.local`):
```bash
npm run convex:env -- list           # list prod env vars
npm run convex:env -- set NAME val   # set a prod env var
npm run convex:logs                  # tail prod function logs
npm run convex:dashboard             # open the prod dashboard
```

## Architecture (quick map)

- **Auth:** Convex Auth with **GitHub** OAuth. Each GitHub user gets a private,
  isolated set of entries. See `convex/auth.ts`, `convex/auth.config.ts`,
  `convex/http.ts`.
- **Data:** `entries` table, scoped by `userId` (`by_user` index). All queries +
  mutations in `convex/entries.ts` are gated by `getAuthUserId` and check row
  ownership. `convex/users.ts` exposes `currentUser`. `convex/lib.ts` has the pure
  helpers (`parseEntry`, `retagRaw`, `applyStatus`).
- **Client store:** `src/store/useEntries.ts` wraps Convex `useQuery`/`useMutation`
  but keeps the same public API the UI already used, so components are unchanged.
- **Local-only state (localStorage, NOT Convex):** theme, show-timestamps,
  show-tags, task-tags, and sort/view. See `src/store/usePrefs.ts`,
  `src/store/useTheme.ts`, and `loadView` in `src/App.tsx`. Keep these local — do
  not move them to Convex (per-device, flash-free).
- **Config:** `src/config.ts` is the single source of truth for brand, commands,
  copy, shortcuts, theme colors, and the (theme/view/prefs) localStorage keys.

## Deployment / CI

Pushing to `main` triggers `.github/workflows/deploy.yml`, which deploys Convex to
prod and ships the frontend to Vercel. See `DEPLOY.md` for the secrets and setup.
Do not re-introduce a dev deployment in CI.

## Don'ts

- ❌ `npx convex dev` (creates/uses a dev deployment)
- ❌ adding `--prod` everywhere (unnecessary — `.env.local` already targets prod)
- ❌ moving theme/prefs/view into Convex
- ❌ committing secrets (`.env.local`, `.vercel/` are gitignored)
