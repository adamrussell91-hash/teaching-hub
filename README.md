# Teaching Hub

A Vite + TypeScript scaffold for the Teaching Hub first slice.

## Prerequisites

- Node.js 22 or later

## Development

```bash
npm install
npm run dev
```

Opens the dev server at [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

Output is written to `dist/`.

## GitHub Pages

The `.github/workflows/pages.yml` workflow builds and deploys `dist/` on push to `main`.

Vite `base` is `/` (user or org site, or a custom domain). For a **project** site at `https://<user>.github.io/<repo>/`, set `base: '/Teaching-Hub/'` in `vite.config.ts` before building.

## Tests

```bash
npm test              # all Vitest tests
npm run test:unit     # unit tests only
npm run test:integration
npm run test:browser  # Playwright browser tests
```
