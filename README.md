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

Output: `dist/` (what GitHub Pages deploys).

## Deploy

### Site — GitHub Pages

`.github/workflows/pages.yml` runs on push to `main`: `npm ci` → `npm test` → `npm run build` → publish `dist/`.

In the repo Settings → Pages, set Source to **GitHub Actions**.

Vite `base` is `/` (user/org site or custom domain). For a **project** site at `https://<user>.github.io/<repo>/`, set `base: '/<repo>/'` in `vite.config.ts` before building.

### API — Netlify Functions only

`netlify.toml` publishes a placeholder under `netlify/public` and deploys `netlify/functions`. Create a Netlify site from this repo (Functions only).

Generate secrets (interactive, no echo):

```bash
npm run generate:auth
```

Set Netlify environment variables:

```text
TEACHING_HUB_PASSPHRASE_HASH=<from generate:auth>
SESSION_SECRET=<from generate:auth>
SITE_ORIGIN=<https://your-pages-origin>   # no trailing slash
```

Point the client at the Functions host by editing `src/api/config.ts` (`API_BASE_URL` for non-localhost). That URL is not a secret.

Seed curriculum into Blobs (explicit; curriculum GET never auto-seeds):

```bash
# With Netlify Blobs credentials / linked site available:
npm run seed:blobs
```

## Out of scope (later)

AI chat, Google Drive media, class scheduling, Scope and Sequence, A4 print, full block library, version browser.
