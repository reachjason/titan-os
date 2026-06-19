# Titan OS - project guide for AI agents & contributors

**Live:** https://www.usetitan.xyz - deploys on every push to `main`.

## Environment model

- Local development uses a separate Convex cloud dev deployment:
  - Dev deployment: `abundant-jaguar-978`
  - Cloud URL: `https://abundant-jaguar-978.convex.cloud`
  - HTTP/Site URL: `https://abundant-jaguar-978.convex.site`
- Production remains:
  - Prod deployment: `robust-grasshopper-674`
  - Cloud URL: `https://robust-grasshopper-674.convex.cloud`
  - HTTP/Site URL: `https://robust-grasshopper-674.convex.site`
- `.env.local` is gitignored and should point at dev for day-to-day work.
- `.env.prod.local` is a local backup with prod URLs for maintenance reference.

## How to work locally

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

`npm run dev` runs `convex dev --start "vite --host 127.0.0.1"`, which pushes
Convex functions/schema to the dev deployment, watches `convex/`, and starts Vite
at `http://127.0.0.1:5173`.

Useful commands:

```bash
npm run dev:convex       # Convex watcher only
npm run dev:frontend     # Vite only, using existing .env.local
npm run build            # tsc -b && vite build
npm run convex:env -- list
npm run convex:logs
```

Local GitHub auth uses the dev deployment callback:

```text
https://abundant-jaguar-978.convex.site/api/auth/callback/github
```

Required dev Convex env vars are already configured: `SITE_URL`,
`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `JWT_PRIVATE_KEY`, and `JWKS`.

For other contributors:

- They can run local frontend + shared dev backend by copying
  `.env.local.example` to `.env.local`.
- They need Convex project access only when running `convex dev` to push backend
  functions/schema. Without Convex access, use `npm run dev:frontend`.
- A private per-person dev deployment requires its own GitHub OAuth app and
  Convex Auth env vars, because each OAuth app has one callback URL.

## Production

Pushing to `main` triggers `.github/workflows/deploy.yml`, which deploys Convex to
prod and ships the frontend to Vercel. Do not use local dev commands to mutate
prod unless explicitly doing production maintenance.

Production commands:

```bash
npm run convex:env:prod -- list
npm run convex:logs:prod
npm run convex:deploy
```

## Architecture

- **Auth:** Convex Auth with GitHub OAuth. See `convex/auth.ts`,
  `convex/auth.config.ts`, and `convex/http.ts`.
- **Data:** `entries` table scoped by `userId`; shared entries are visible to
  mentioned users. See `convex/schema.ts`, `convex/entries.ts`, and
  `convex/users.ts`.
- **Client store:** `src/store/useEntries.ts` wraps Convex queries/mutations.
- **Local-only state:** theme, timestamps, tag visibility, task tags, sort/view,
  and recent Spotlight searches stay in localStorage.
- **Config:** `src/config.ts` is the source of truth for brand, commands, copy,
  shortcuts, colors, and localStorage keys.

## Don'ts

- Do not point `.env.local` at production for normal local development.
- Do not commit secrets (`.env.local`, `.env.prod.local`, `.vercel/`).
- Do not move per-device preferences into Convex.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
