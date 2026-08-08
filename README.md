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
```

4. Trigger a Netlify deploy. Note the Functions host, e.g. `https://<site>.netlify.app`.

### 3. Point the Pages app at Netlify

Either:

- Set a GitHub Actions secret / variable `VITE_API_BASE_URL` to that Netlify origin and rebuild Pages, **or**
- Edit the placeholder in `src/api/config.ts`, commit, and push `main` so Pages rebuilds.

That URL is not a secret.

### 4. Seed curriculum into Blobs

Curriculum GET never auto-seeds. Once, with Netlify Blobs credentials / a linked site:

```bash
npm run seed:blobs
```

### 5. Smoke-check production

1. Open the Pages URL → sign in with the passphrase you hashed for Netlify.
2. Open a seed lesson → edit → save → publish.
3. Open `/s/lessons/<id>` in a private window (and refresh that URL to confirm the SPA fallback).
4. Sign out from the teacher rail.

## Out of scope (later)

AI chat, Google Drive media, class scheduling, Scope and Sequence, A4 print, full block library, version browser.
