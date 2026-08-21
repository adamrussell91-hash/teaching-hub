# Notion Markdown Lesson Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a unit page, choosing a Notion Markdown & CSV zip writes one draft lesson per `.md` file into that unit, with no confirm or Accept gates.

**Architecture:** Browser unpacks the zip (`fflate`). A pure library maps Markdown to existing block types, uploads zip images through `uploadMediaFile`, and writes with `POST /api/lessons` + `PUT /api/lessons/:id`. Optional `lesson.origin` stores the Notion page id for idempotent re-import. The unit page adds an Import button that starts the transfer immediately.

**Tech Stack:** TypeScript, Vitest, happy-dom, Zod, existing Netlify Blobs lesson/media APIs, `fflate` for unzip.

**Spec:** `docs/superpowers/specs/2026-08-21-notion-lesson-import-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/schemas/lesson.ts` | Optional `origin` |
| `src/teacher/nav.ts` | `origin` on `CurriculumLessonSummary` |
| `src/curriculum/lesson-summary.ts` | Copy `origin` onto summaries |
| `src/import/notion/filename.ts` | Parse Notion export filenames |
| `src/import/notion/markdown-to-blocks.ts` | Deterministic MD → blocks |
| `src/import/notion/zip.ts` | Unzip, list pages, read bytes |
| `src/import/notion/run-import.ts` | Batch write / re-import |
| `src/teacher/import-notion.ts` | File input + status + progress |
| `src/teacher/sections/units.ts` | Import control on unit header |
| `package.json` | Add `fflate` |

---

### Task 1: Lesson `origin` schema

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `src/teacher/nav.ts`
- Modify: `src/curriculum/lesson-summary.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/schemas-lesson.test.ts`, add:

```ts
it('accepts optional Notion origin and still parses lessons without it', () => {
  const withOrigin = LessonSchema.parse({
    ...draftLesson,
    origin: {
      source: 'notion_export',
      page_id: '1a2b3c4d5e6f7890abcd1234ef567890',
      export_path: 'Unit/Memory 1a2b3c4d5e6f7890abcd1234ef567890.md'
    }
  });
  expect(withOrigin.origin?.page_id).toBe('1a2b3c4d5e6f7890abcd1234ef567890');
  expect(LessonSchema.parse(draftLesson).origin).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schemas-lesson.test.ts -t "optional Notion origin"`

- [ ] **Step 3: Add schema + summary pass-through**

```ts
export const LessonOriginSchema = z.object({
  source: z.literal('notion_export'),
  page_id: z.string().min(1),
  export_path: z.string().min(1)
});
```

Add `origin: LessonOriginSchema.optional()` to `LessonSchema`. Export the type. Add `origin?: Lesson['origin']` to `CurriculumLessonSummary`. In `toCurriculumLessonSummary`, spread origin when present.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/schemas-lesson.test.ts tests/unit/curriculum-lesson-summary.test.ts`

---

### Task 2: Filename parser

**Files:**
- Create: `src/import/notion/filename.ts`
- Create: `tests/unit/notion-import-filename.test.ts`

- [ ] **Step 1: Write failing tests** for:
  - `Memory and Identity 1a2b3c4d5e6f7890abcd1234ef567890.md` → title + page_id
  - nested path
  - no hash → title from stem, `page_id` prefixed `path:` + path
  - URI-encoded spaces

- [ ] **Step 2: Implement `parseNotionExportPath(path: string): { title, page_id, export_path }`**

Strip directories. Match `/\s([0-9a-f]{32})$/i` on the stem. Title is the remainder, whitespace-collapsed. `export_path` is the zip-relative path with `/` separators.

- [ ] **Step 3: Run** `npx vitest run tests/unit/notion-import-filename.test.ts`

---

### Task 3: Markdown → blocks

**Files:**
- Create: `src/import/notion/markdown-to-blocks.ts`
- Create: `tests/unit/notion-import-markdown.test.ts`

- [ ] **Step 1: Write fixtures + failing tests** covering heading, paragraph, list, quote, callout emoji, fence, divider, GFM table, `<details>`, image with relative src (leave `url` as the relative path; upload happens later), skip duplicate H1 matching title.

Signature:

```ts
export function markdownToBlocks(
  markdown: string,
  options: { title: string; nextId: () => string }
): Block[]
```

- [ ] **Step 2: Implement a line-oriented mapper.** Use `createBlock` then fill `content`. Inline markup: `**` `*` `` ` `` `[text](url)` → HTML inside `rich_text`.

- [ ] **Step 3: Run** `npx vitest run tests/unit/notion-import-markdown.test.ts`

---

### Task 4: Zip listing

**Files:**
- Create: `src/import/notion/zip.ts`
- Create: `tests/unit/notion-import-zip.test.ts`
- Modify: `package.json` (add `fflate`)

- [ ] **Step 1: Add dependency** `npm install fflate`

- [ ] **Step 2: Write failing tests** with `zipSync` from `fflate`: nested md included, csv skipped, `__MACOSX` skipped, image bytes readable by relative path.

- [ ] **Step 3: Implement** `listNotionZipPages(bytes: Uint8Array)` and `readZipEntry(bytes, path)`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/notion-import-zip.test.ts`

---

### Task 5: Run import (no UI)

**Files:**
- Create: `src/import/notion/run-import.ts`
- Create: `tests/unit/notion-import-run.test.ts`

- [ ] **Step 1: Write failing tests** with injected deps:

```ts
export interface NotionImportDeps {
  postLesson: (body: { title: string; unit_id: string }) => Promise<Lesson>
  getLesson: (id: string) => Promise<Lesson>
  putLesson: (lesson: Lesson) => Promise<Lesson>
  uploadImage: (file: File) => Promise<{ url: string }>
  now?: () => string
}

export async function runNotionImport(options: {
  zipBytes: Uint8Array
  unitId: string
  existing: Array<{ id: string; unit_id: string; origin?: Lesson['origin'] }>
  deps: NotionImportDeps
  onProgress?: (done: number, total: number) => void
}): Promise<{ imported: number; updated: number; failed: number; errors: string[] }>
```

Cases: two nested md → two POSTs; matching origin → GET+PUT no second POST; image upload fail → lesson still written; 401 aborts.

- [ ] **Step 2: Implement runner.** Resolve image paths, upload once per zip path, replace `image.content.url` with uploaded URL.

- [ ] **Step 3: Run** `npx vitest run tests/unit/notion-import-run.test.ts`

---

### Task 6: Unit page Import control

**Files:**
- Create: `src/teacher/import-notion.ts`
- Modify: `src/teacher/sections/units.ts`
- Modify: `tests/unit/sections-units.test.ts`
- Create: `tests/unit/import-notion-control.test.ts`

- [ ] **Step 1: Failing test** — unit page has `[data-import="notion"]` labelled Import; clicking it does not show a confirm card; choosing a file calls the runner.

- [ ] **Step 2: Mount hidden file input + Import button in `renderUnitPage` header actions.** `mountNotionImport` reads the file as `ArrayBuffer`, calls `runNotionImport` with live APIs (`postLesson`, `getLesson`, `apiPut`, `uploadMediaFile`). No `window.confirm`. Status text on `data-import-status`. After batch, `options.onMutated?.()`.

- [ ] **Step 3: Run** `npx vitest run tests/unit/sections-units.test.ts tests/unit/import-notion-control.test.ts`

---

### Task 7: Verify

- [ ] **Step 1:** `npx vitest run tests/unit/schemas-lesson.test.ts tests/unit/notion-import-filename.test.ts tests/unit/notion-import-markdown.test.ts tests/unit/notion-import-zip.test.ts tests/unit/notion-import-run.test.ts tests/unit/sections-units.test.ts tests/unit/import-notion-control.test.ts`

- [ ] **Step 2:** `npx tsc -p tsconfig.json --noEmit`

Do not commit unless Adam asks.
