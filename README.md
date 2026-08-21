# Teaching Hub

Private teaching workspace for curriculum planning, lesson editing, and student publishing.

**First slice:** sign in → navigate Year → Subject → Unit → Lesson → edit blocks → save draft → publish → open a public student URL.

Design: [`docs/superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md`](docs/superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md)  
Plan: [`docs/superpowers/plans/2026-08-07-teaching-hub-first-slice.md`](docs/superpowers/plans/2026-08-07-teaching-hub-first-slice.md)  
Product specs: [`docs/specs/`](docs/specs/)

## Stack

- **Vite + TypeScript** (no React) — teacher and student SPAs
- **GitHub Pages** — static shell (`dist/`)
- **Netlify Functions + Blobs** — auth and teaching content (draft + published JSON)
- Clinical Glass design tokens (shared language with Life Hub)

Editing a lesson never rebuilds the site.

## Prerequisites

- Node.js 22 or later

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

| | |
|---|---|
| Local passphrase | `teaching-hub-local` |
| Seed demo lesson | Year 12 → English Advanced → Artist of the Floating World → *Memory, Identity and Ono* |
| Student URL pattern | `/s/lessons/:lessonId` (e.g. `/s/lessons/lesson_aotfw_008`) |

The Vite dev server mounts a mock `/api/*` with the same contract as production (in-memory store seeded from `fixtures/seed.json`).

## Tests

```bash
npm test                 # Vitest unit + integration
npm run test:unit
npm run test:integration
npx playwright install chromium   # once
npm run test:browser     # Playwright publish → student acceptance
```

If Playwright cannot find browsers in this environment, point it at your machine cache:

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

## Build

```bash
npm run build
```

Output: `dist/` (what GitHub Pages deploys). The build also writes `dist/404.html` (copy of the SPA shell) so deep links like `/s/lessons/:id` work on refresh.

## Deploy

Do these in order the first time. You only need to re-seed Blobs when curriculum seed data changes.

### 1. Create the GitHub repo and enable Pages

1. Create an empty GitHub repo and add it as `origin` (this workspace has no remote yet).
2. Push `main`.
3. Repo **Settings → Pages → Source: GitHub Actions**.
4. Confirm the Actions workflow `Deploy to GitHub Pages` succeeds. Live site: `https://teaching-hub.adam-russell.com`.

Vite `base` is `/` (user/org site or custom domain). For a **project** site at `https://<user>.github.io/<repo>/`, set `base: '/<repo>/'` in `vite.config.ts` before building.

### 2. Deploy the API on Netlify

1. Create a Netlify site from this repo (Functions only — `netlify.toml` already points at `netlify/functions`).
2. Generate secrets locally (interactive, no echo):

```bash
npm run generate:auth
```

3. Set Netlify environment variables:

```text
TEACHING_HUB_PASSPHRASE_HASH=<from generate:auth>
SESSION_SECRET=<from generate:auth>
SITE_ORIGIN=https://teaching-hub.adam-russell.com
GITHUB_BACKUP_TOKEN=<optional GitHub PAT with contents:write>
GITHUB_BACKUP_REPO=owner/content-backup-repo
GITHUB_BACKUP_BRANCH=main
# Weekly snapshot runs on Netlify production (Sunday 00:00 UTC) when those vars are set.
```

4. Add a same-site API hostname (required for the session cookie — same as Life Hub’s `api.adam-russell.com`):
   - Cloudflare CNAME `teaching-api` → your `*.netlify.app` site (**DNS only**)
   - Netlify Domain management → add `teaching-api.adam-russell.com` → wait for HTTPS
5. Trigger a Netlify deploy after env vars / domain changes.

### 3. Google Drive picker (teacher Resources)

The picker is client-only. Vite can inline these at **Pages build** time (`VITE_*`), or a signed-in teacher can load the same public values from Netlify (`GOOGLE_CLIENT_ID` / `GOOGLE_PICKER_API_KEY` / `GOOGLE_APP_ID` via `/api/drive-picker-config`).

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create (or pick) a project. Enable **Google Picker API** and **Google Drive API**.
2. OAuth consent screen (External is fine for a private teacher app). Add yourself as a test user. Scope: `https://www.googleapis.com/auth/drive.file`.
3. Credentials → **OAuth 2.0 Client ID** (Web application). Authorized JavaScript origins:
   - `https://teaching-hub.adam-russell.com`
   - `http://localhost:5173`
4. Credentials → **API key**. Restrict to **Google Picker API** and HTTP referrers:
   - `https://teaching-hub.adam-russell.com/*`
   - `http://localhost:5173/*`
5. Copy the Cloud **project number** (IAM & Admin → Settings). Picker needs it as App ID for `drive.file`.

Then:

```text
VITE_GOOGLE_CLIENT_ID=<oauth web client id>
VITE_GOOGLE_PICKER_API_KEY=<browser api key>
VITE_GOOGLE_APP_ID=<project number>
```

- Local: put the `VITE_*` names in `.env` (see `.env.example`) and restart `npm run dev`.
- Production Pages build: `gh secret set` the three `VITE_*` names, then push `main` (or **Actions → Deploy to GitHub Pages → Run workflow**).
- Or set `GOOGLE_CLIENT_ID`, `GOOGLE_PICKER_API_KEY`, and `GOOGLE_APP_ID` on the Netlify Functions site so the live SPA can fetch them without a Pages rebuild.

These values appear in the teacher JS bundle by design. Restrict the API key and OAuth origins as above.

### 4. Point the Pages app at the API

`src/api/config.ts` should use `https://teaching-api.adam-russell.com` (sibling of the Pages site under `adam-russell.com`). That URL is not a secret. Push `main` so Pages rebuilds.

### 5. Seed curriculum into Blobs

Curriculum GET never auto-seeds. Once, with Netlify Blobs credentials / a linked site:

```bash
npm run seed:blobs
```

### 6. Smoke-check production

1. Open the Pages URL → sign in with the passphrase you hashed for Netlify.
2. Open a seed lesson → edit → save → publish.
3. Open `/s/lessons/<id>` in a private window (and refresh that URL to confirm the SPA fallback).
4. Sign out from the teacher rail.

## Out of scope (later)

Multi-teacher roles, stored Drive refresh tokens, Drive folder sync.
