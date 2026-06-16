# Titan OS — Convex + Vercel deployment

The app now uses **Convex** (real-time DB + serverless functions, per-user auth via
**GitHub**) for entries, and is built as a static **Vite** app to host on **Vercel**.
Theme / show-timestamps / show-tags / task-tags / sort+view stay in `localStorage`
(per-device). Entries are private per signed-in GitHub user.

`.env.local` (gitignored) holds the dev deployment URLs:
```
CONVEX_DEPLOYMENT=dev:abundant-jaguar-978
VITE_CONVEX_URL=https://abundant-jaguar-978.convex.cloud
VITE_CONVEX_SITE_URL=https://abundant-jaguar-978.convex.site
```

---

## A. Finish DEV setup (GitHub login locally)

These steps need **you** — they require a GitHub OAuth app and its secret.

1. **Create a GitHub OAuth App** (dev): github.com → Settings → Developer settings →
   OAuth Apps → **New OAuth App**
   - Application name: `Titan OS (dev)`
   - Homepage URL: `http://localhost:5173`
   - **Authorization callback URL:**
     `https://abundant-jaguar-978.convex.site/api/auth/callback/github`
   - Register → copy the **Client ID**, then **Generate a new client secret**.

2. **Set the secrets on the Convex dev deployment** (run in the project dir):
   ```bash
   npx convex env set AUTH_GITHUB_ID <your-client-id>
   npx convex env set AUTH_GITHUB_SECRET <your-client-secret>
   ```

3. **Run it:**
   ```bash
   npx convex dev          # terminal 1 (keeps functions + auth routes live)
   npm run dev             # terminal 2 → http://localhost:5173
   ```
   Click **Continue with GitHub** → authorize → you land in the workspace.
   `SITE_URL` is already set to `http://localhost:5173` for dev.

---

## B. PRODUCTION — Convex prod deployment

1. **Create a second GitHub OAuth App** (prod) — same as above but:
   - Homepage URL: your Vercel URL (e.g. `https://titan-os.vercel.app`)
   - Authorization callback URL:
     `https://<your-prod-deployment>.convex.site/api/auth/callback/github`
     (You'll know `<your-prod-deployment>` after the first `npx convex deploy`, or
     read it from the Convex dashboard → prod → Settings → URL & Deploy Key. The
     `.site` host is the HTTP Actions URL.)

2. **First prod deploy of Convex functions** (creates the prod deployment so you
   know its name/URLs for the OAuth app):
   ```bash
   npx convex deploy
   ```

3. **Set prod env vars** (note the `--prod` flag):
   ```bash
   npx convex env set AUTH_GITHUB_ID <prod-client-id> --prod
   npx convex env set AUTH_GITHUB_SECRET <prod-client-secret> --prod
   npx convex env set SITE_URL https://<your-vercel-domain> --prod
   ```
   (`JWT_PRIVATE_KEY` + `JWKS` are generated automatically on first prod deploy. If
   not, run `npx @convex-dev/auth --prod` once.)

---

## C. PRODUCTION — Vercel via GitHub Actions (so ANY push to main deploys)

On Vercel's **Hobby (free)** plan, Vercel's built-in Git integration only deploys
commits authored by the Vercel account owner — collaborators' pushes are skipped.
To make **every push to `main` go live regardless of author**, we deploy from
**GitHub Actions** using the Vercel CLI + a token. See `.github/workflows/deploy.yml`.

The workflow, on each push to `main`/`master`:
1. `npx convex deploy` — ships Convex backend to prod (uses `CONVEX_DEPLOY_KEY`).
2. `vercel build` + `vercel deploy --prebuilt --prod` — builds the frontend with
   the prod `VITE_CONVEX_URL` and ships it to Vercel (uses the Vercel token).

### One-time setup

1. **Link the project locally** to get the org/project IDs:
   ```bash
   npm i -g vercel
   vercel link            # pick/create the Vercel project (Framework: Vite)
   cat .vercel/project.json   # → "orgId" and "projectId"
   ```
   (`.vercel/` is gitignored.)

2. **Collect the values:**
   - `VERCEL_TOKEN` — Vercel → Account Settings → **Tokens** → Create.
   - `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — from `.vercel/project.json`.
   - `CONVEX_DEPLOY_KEY` — Convex dashboard → **Production** → Settings →
     URL & Deploy Key → generate a **Production** deploy key.
   - `VITE_CONVEX_URL` — your **prod** Convex `.cloud` URL (next to the prod deploy
     key). NOT the `abundant-jaguar-978` dev URL.

3. **Add them as GitHub repo secrets:** repo → Settings → Secrets and variables →
   **Actions** → New repository secret, for each of:
   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `CONVEX_DEPLOY_KEY`,
   `VITE_CONVEX_URL`.

4. **Turn OFF Vercel's Git integration** so only the Action deploys (avoids
   double/racing deploys): Vercel → project → Settings → **Git** → Disconnect.
   The Vercel project still exists and receives CLI deploys from the Action.

5. **Push to `main`.** The Action runs and deploys both Convex + frontend. After the
   first deploy, confirm the prod GitHub OAuth app's callback points at the prod
   `.site` host and `SITE_URL` (prod) = the Vercel domain.

### Build command note

Because the Action runs `convex deploy` separately, the app's own build stays plain
`npm run build` (`tsc -b && vite build`) — do **not** also set Vercel's build command
to `npx convex deploy --cmd ...`, or Convex would deploy twice.

---

## Notes / gotchas

- **Two GitHub OAuth apps** (dev + prod) — each needs its own callback to the
  matching Convex `.site` host. A callback mismatch is the #1 cause of a redirect
  error after authorizing.
- `convex/_generated/` is committed on purpose so the CI build resolves `api`
  without running `convex dev`.
- **Secrets** (`AUTH_GITHUB_SECRET`, `CONVEX_DEPLOY_KEY`, `VERCEL_TOKEN`) are set by
  you via `npx convex env set` / GitHub repo secrets — never committed, never through
  the assistant.
- **Data is empty per the chosen plan** — no seed, no localStorage import. A brand
  new GitHub account sees the "Your log is empty." first-run state. (Export/Import
  JSON in Settings still works; Import re-creates entries via the `add` mutation.)
- Each GitHub user gets a fully isolated set of entries (queries/mutations are gated
  by `getAuthUserId` + an ownership check on every row).
- **Branch name:** the workflow triggers on both `main` and `master`. Your repo's
  default branch is currently `master` — rename to `main` or leave as is; the
  workflow covers both.
