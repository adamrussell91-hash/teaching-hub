# Notion Markdown lesson import

**Date:** 2026-08-21  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Transfer a Notion “Markdown & CSV” zip into one unit as real draft lessons, with no Accept or confirm gates

## Goal

Adam exports Notion pages in the chunks he wants. On a unit page he chooses that zip. Every Markdown page in it becomes a draft lesson in that unit. Blocks write immediately. He does not approve a thousand blocks.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Input | Notion **Markdown & CSV** zip only |
| Placement | Current unit. Every `.md` file is a lesson in that unit, including nested pages |
| CSV | Skip. Databases are not lessons |
| Output | Editable Teaching Hub lessons (real blocks), drafts, never published |
| Approval | **None.** No Accept loop, no confirm card, no overwrite prompt |
| Conversion | Deterministic Markdown → blocks. Not Clementine |
| Re-import | Same Notion page id in the same unit replaces title + blocks |
| Images | Files inside the zip upload through existing `/api/media/upload` and become `image` blocks |
| Failed image | Page still imports; image becomes `rich_text` noting the missing file |
| Unknown syntax | Falls back to `rich_text` |
| Empty `.md` | Lesson with a title and no blocks |
| AI / confirm-card rule | Does not apply. This is a file transfer, not an agent write |

## Architecture

The browser unpacks the zip, maps Markdown to blocks, uploads images, and writes through the existing lesson APIs. The server stays dumb. Netlify request size and function timeouts must not gate a hundred-page dump.

```
Unit page  →  file input (.zip)  →  unpack  →  list .md pages
     →  Markdown → blocks (+ upload images)
     →  POST /api/lessons  or  GET + PUT existing
     →  status line  (Imported 47 pages)
```

Pure library under `src/import/notion/`. UI on the unit page is a thin trigger. Tests cover the library without the network.

Why not a Netlify zip endpoint: a Teaching Day Book export with images will blow sync function time and payload limits. Existing `POST /api/lessons`, `PUT /api/lessons/:id`, and `POST /api/media/upload` already persist to Blobs.

## UI

On the unit page header, next to Export JSON: an **Import** control (`.btn.btn--secondary`). Hidden `<input type="file" accept=".zip,application/zip">`. Choosing a file starts the transfer. No dialog. No confirm card.

While running, the header supporting line (or a status node on the lessons section) shows progress: `Importing 12 of 47…`. When finished: `Imported 47 pages.` Failures: `Imported 44 pages. 3 failed.` A bad zip: `Couldn't read that zip.` No Markdown pages: `No Notion pages in this zip.`

After a successful write, refresh curriculum so the unit lesson list updates. Do not remount in a way that loses an unsaved unit-plan editor if the import is still on the same page — prefer appending to the in-memory lesson list and calling `onMutated` only after the batch completes.

Kit: existing `.btn`, page header actions, Inter. Do not invent a drop-zone chrome kit.

## Origin and identity

Add optional lesson metadata (blob-compatible; old lessons without it still parse):

```ts
origin?: {
  source: 'notion_export'
  page_id: string      // 32-char hex from the Notion filename
  export_path: string  // zip-relative path, for humans
}
```

Notion export files look like `Memory and Identity 1a2b3c4d5e6f7890abcd1234ef567890.md`. `page_id` is that trailing 32 hex. Title is the filename with that id stripped, decoded, trimmed. If the filename has no id, title is the stem and `page_id` is a stable hash of the zip-relative path.

Curriculum lesson summaries include `origin` when present so re-import can match without fetching every lesson.

Re-import in the **same unit** with the same `page_id`: `GET` the lesson, `PUT` title + blocks + origin, keep id / sequence / tags / outcomes / publish state. Do not unpublish. Do not create a duplicate.

A page id seen in a **different** unit is a new lesson in the current unit.

## Markdown → blocks

Use `createBlock` / shared block fields. New ids from `nextBlockIdFactory`. Visibility `student_teacher`.

| Notion Markdown | Block |
|-----------------|--------|
| `#` / `##` / `###+` | `heading` `page` / `section` / `subsection` |
| Paragraph, bold, italic, inline code, links | `rich_text` (`content.html`) |
| Unordered / ordered lists | `rich_text` with `<ul>` / `<ol>` |
| `>` without callout cue | `quote` |
| `>` starting with a callout emoji (`💡` `ℹ️` `⚠️` `❗` `📝` …) | `callout` (`information` / `warning` / `important` / `remember`) |
| Fenced ` ``` ` | `code` (language from info string when present) |
| `---` / `***` | `divider` |
| `![alt](relative-or-url)` | `image` after upload; remote `http(s)` urls used as-is |
| GFM table | `table` (`headers` + `rows`) |
| `<details><summary>` | `accordion` (one item; consecutive details may merge into one accordion) |
| Child-page markdown links | `rich_text` with the link text (the child file is its own lesson) |
| HTML the mapper does not understand | `rich_text` wrapping the escaped/kept snippet |

Do not emit `html` / `html_app` blocks for ordinary prose. Do not invent Drive ids. Do not write Notion URLs into `embed` unless the line is already a bare http(s) URL (then `embed` `generic`).

First `#` heading that equals the derived title may be omitted so the lesson title is not doubled. Other headings stay.

## Zip rules

- Recurse every folder in the zip.
- Import every `*.md` except files named `index.md` only if we later need an exception — **v1 imports every `.md`**.
- Skip `*.csv`.
- Skip `__MACOSX` and `*.DS_Store`.
- Resolve image paths relative to the `.md` file’s directory in the zip. Try URI-decoded and raw names.
- Guess image MIME from extension (`png` `jpg` `jpeg` `webp` `gif`). Skip upload if the type is not in `ALLOWED_MEDIA_MIME`.

## Write path

For each page, in zip order (parent directories first, then filename):

1. Map blocks. Upload each local image once per zip path (cache by zip path).
2. If a lesson in this unit has `origin.page_id` matching: GET, PUT replacement.
3. Else: `POST /api/lessons` with `{ title, unit_id }`, then `PUT` the full lesson including `blocks` and `origin`.
4. Continue on per-page failure. Stop the batch only on `401`.

Lessons stay `status: 'active'` drafts. `published_at` is untouched on update.

## Errors and safety

- Teacher session required (existing APIs).
- One zip at a time. A second choose while running is ignored or replaces the input after the current page finishes — **ignore** until the batch ends (simpler).
- Do not delete existing lessons that are not in the zip.
- Do not write to Notion.
- Do not publish.
- Sites still do not read `~/Downloads` or any local Mac path. The teacher uploads the zip.

## Testing

Tests before implementation for:

1. Filename → title + `page_id`.
2. Markdown fixtures → expected block types and content (heading, rich_text, list, quote, callout, code, divider, table, accordion, image placeholder).
3. Zip listing: nested `.md` included, `.csv` skipped, `__MACOSX` skipped.
4. Re-import matches `origin.page_id` in the same unit and does not POST a second lesson.
5. Image upload failure still produces a lesson.
6. Unit page shows Import, choosing a zip starts the transfer with **no** confirm card.
7. `LessonSchema` accepts and round-trips `origin`; old lessons without it still parse.

## Out of scope

- HTML or PDF Notion exports
- Live Notion API / MCP ingest
- CSV / database import
- Auto-publish
- CLI (the library may be reused later; no script in this slice)
- Mapping Notion databases, synced blocks, or columns to hub `columns` / `tabs`
- Rewriting child-page links to Teaching Hub lesson URLs
- Import on the lessons library index (unit page only)

## Files

| Path | Role |
|------|------|
| `src/schemas/lesson.ts` | Optional `origin` |
| `src/teacher/nav.ts` + `src/curriculum/lesson-summary.ts` | Pass `origin` on summaries |
| `src/import/notion/filename.ts` | Title + page id |
| `src/import/notion/markdown-to-blocks.ts` | Mapper |
| `src/import/notion/zip.ts` | Unpack + list pages + read bytes |
| `src/import/notion/run-import.ts` | Orchestrate writes |
| `src/teacher/import-notion.ts` | Wire file input → runner |
| `src/teacher/sections/units.ts` | Import button |
| `tests/unit/notion-import-*.test.ts` | Library + UI |
