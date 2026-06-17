# Titan OS - Deployment

**Live:** https://www.usetitan.xyz — deployed on every push to `main` via GitHub
Actions (`.github/workflows/deploy.yml`). Fully working end-to-end: custom domain →
Vercel frontend → Convex backend → GitHub auth → per-user data.

This project now uses separate Convex deployments for local development and
production. Entries live in Convex, scoped per GitHub user; theme/prefs/sort+view
stay in `localStorage` (per-device).

- Production site: `https://www.usetitan.xyz`
- Convex prod Cloud URL: `https://robust-grasshopper-674.convex.cloud`
- Convex prod Site URL (OAuth callbacks): `https://robust-grasshopper-674.convex.site`
- Convex dev Cloud URL: `https://abundant-jaguar-978.convex.cloud`
- Convex dev Site URL (OAuth callbacks): `https://abundant-jaguar-978.convex.site`
- `.env.local` (gitignored) pins the CLI + frontend to dev:
  ```
  CONVEX_DEPLOYMENT=dev:abundant-jaguar-978
  VITE_CONVEX_URL=https://abundant-jaguar-978.convex.cloud
  VITE_CONVEX_SITE_URL=https://abundant-jaguar-978.convex.site
  ```
- `.env.local.example` is committed with the shared dev values; new contributors
  should copy it to `.env.local`.
- `.env.prod.local` is a gitignored local backup with prod values for maintenance.

Local commands:

```bash
npm run dev                # Convex dev watcher + Vite
npm run convex:env -- list # dev env vars
npm run convex:logs        # dev logs
```

Production commands:

```bash
npm run convex:env:prod -- list
npm run convex:logs:prod
npm run convex:deploy
```

---

## Contributor local setup

Most contributors can use the shared dev deployment:

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

They need repo access, Node/npm, and a GitHub account for signing in. They do not
need to create GitHub OAuth credentials for the shared dev deployment.

To change or test files in `convex/`, they also need access to the Convex project
`viral-sangani/titan-os`; otherwise `convex dev` cannot push functions/schema.
Frontend-only local work can run with:

```bash
npm run dev:frontend
```

If a contributor wants their own isolated dev database instead of the shared dev
deployment, they must create/select their own Convex dev deployment and configure
Convex Auth env vars there:

```bash
npx convex deployment select dev
npx convex dev --once
npx @convex-dev/auth --web-server-url http://localhost:5173
npx convex env set AUTH_GITHUB_ID <client-id>
npx convex env set AUTH_GITHUB_SECRET <client-secret>
```

They also need a GitHub OAuth App whose callback is:

```text
https://<their-dev-deployment>.convex.site/api/auth/callback/github
```

GitHub OAuth Apps only have one callback URL, so do not reuse the prod OAuth app
for a personal dev deployment.

---

## Done & verified

- Prod Convex deployment created; schema + functions + auth tables deployed.
- Prod auth keys generated (`JWT_PRIVATE_KEY`, `JWKS`).
- Prod Convex env set: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
  `SITE_URL=https://www.usetitan.xyz`.
- GitHub OAuth app callback → `https://robust-grasshopper-674.convex.site/api/auth/callback/github`.
- GitHub login → create / persist / delete entry all verified on prod.
- Dev Convex deployment selected locally: `abundant-jaguar-978`.
- Dev Convex env set: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
  `SITE_URL=http://localhost:5173`, `JWT_PRIVATE_KEY`, `JWKS`.
- Dev GitHub OAuth callback reaches GitHub login:
  `https://abundant-jaguar-978.convex.site/api/auth/callback/github`.
- CI/CD: push to `main` → Convex deploy + Vercel build/deploy (5 GitHub secrets set).
- Custom domain `www.usetitan.xyz` attached to the Vercel project.

## A. GitHub OAuth reference (already configured)

If you ever need to recreate the OAuth app:
- **OAuth App** → github.com → Settings → Developer settings → **OAuth Apps**:
  - Homepage URL: `https://www.usetitan.xyz`
  - **Authorization callback URL:**
    `https://robust-grasshopper-674.convex.site/api/auth/callback/github`
- Set the creds on prod Convex:
  ```bash
  npx convex env set AUTH_GITHUB_ID <client-id>
  npx convex env set AUTH_GITHUB_SECRET <client-secret>
  npx convex env set SITE_URL https://www.usetitan.xyz
  ```

To sanity-check what's set:
```bash
npx convex env list
# expect: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, SITE_URL, JWT_PRIVATE_KEY, JWKS
```

## B. Deploy Convex (whenever backend changes)

```bash
npm run convex:deploy      # = convex deploy → pushes schema + functions to prod
```
This is also run automatically by CI on every push to `main` (see below).

---

## C. Vercel via GitHub Actions — any push to `main` goes live

Vercel's **Hobby (free)** plan only deploys commits authored by the account owner.
To make **every push to `main` deploy regardless of author**, we deploy from
**GitHub Actions** with the Vercel CLI (see `.github/workflows/deploy.yml`). On each
push to `main` it:
1. `npx convex deploy` — ships the Convex backend to prod (`CONVEX_DEPLOY_KEY`).
2. `vercel build` + `vercel deploy --prebuilt --prod` — builds the frontend against
   the prod `VITE_CONVEX_URL` and ships it to Vercel.

### One-time setup

1. **Link the Vercel project** to get the IDs:
   ```bash
   npm i -g vercel
   vercel link                 # pick/create the project (Framework: Vite)
   cat .vercel/project.json    # → "orgId" and "projectId"   (.vercel/ is gitignored)
   ```
2. **Add these GitHub repo secrets** (repo → Settings → Secrets and variables →
   **Actions** → New repository secret). These are *GitHub* secrets, separate from
   the Convex env vars in step A:

   | Secret | Value |
   | --- | --- |
   | `CONVEX_DEPLOY_KEY` | Convex dashboard → `robust-grasshopper-674` → Settings → URL & Deploy Key → generate a **Production** deploy key |
   | `VITE_CONVEX_URL` | `https://robust-grasshopper-674.convex.cloud` |
   | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens → Create |
   | `VERCEL_ORG_ID` | from `.vercel/project.json` |
   | `VERCEL_PROJECT_ID` | from `.vercel/project.json` |

3. **Turn OFF Vercel's Git integration** (Vercel → project → Settings → **Git** →
   Disconnect) so only the Action deploys — avoids double/racing deploys.
4. **Push to `main`** → the Action deploys Convex + frontend. Then confirm the prod
   OAuth callback points at `robust-grasshopper-674.convex.site` and prod `SITE_URL`
   equals the Vercel domain.

> Don't also set Vercel's build command to `npx convex deploy --cmd ...` — the Action
> already runs `convex deploy`, so that would deploy Convex twice. Vercel just needs
> the prebuilt output from the CLI.

---

## Notes

- Use separate GitHub OAuth apps for dev and prod. GitHub OAuth Apps support only
  one callback URL, so sharing one app across environments is fragile.
- `convex/_generated/` is committed so CI builds resolve `api` without `convex dev`.
- **Secrets** are set by you (`npx convex env set`, GitHub repo secrets) — never
  committed (`.env.local`, `.env.prod.local`, `.vercel/` are gitignored).
- **No seed / no import** — a brand-new GitHub account sees the "Your log is empty."
  first-run state. Export/Import JSON in Settings still works.
- Each GitHub user's entries are fully isolated (auth-gated + per-row ownership).
