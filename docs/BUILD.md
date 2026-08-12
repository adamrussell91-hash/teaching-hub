# Teaching Hub — Build History & Projection

Living log of shipped slices and what’s next.  
**Update this file at the end of every build slice** (1–3 bullets + move the item from Projection → History).

Canonical product plan: [`docs/specs/09_IMPLEMENTATION_PLAN.md`](specs/09_IMPLEMENTATION_PLAN.md)  
Block primitives: [`docs/specs/03_BLOCK_SYSTEM.md`](specs/03_BLOCK_SYSTEM.md)

---

## How to update (each slice)

1. Add a **History** entry: date, short name, one-line outcome, link to design/plan if any.  
2. Tick or remove the matching **Projection** item.  
3. If priority changed, reorder **Next up** only (don’t rewrite the whole backlog).

---

## Next up

Suggested order for continuing builder / teaching-page work (adjust as needed):

1. **AI composition fill / whole-lesson scope** (Phase 13D–E) — agent panel WIP may still need polish before fully shipped
2. **Class page follow-ups** — wire richer overflow actions (set-current / date edit), student class view parity

Larger product tracks (not “next block”, but still ahead):

- Export / portable backup follow-up (JSON export, Backup Now / GitHub) — deferred from versioning core
- Production hardening (Phase 15)

---

## Shipped (History)

| Date | Slice | Outcome |
|------|--------|---------|
| 2026-08-13 | **Class page redesign** | Month calendar (life-hub model/renderer port), collapsible unit sequence, date-based unit progress (`unit.start_date`/`end_date` optional with scheduled-lesson fallback), read-first cover banner — [`plan`](superpowers/plans/2026-08-12-class-page-redesign.md) |
| 2026-08-11 | **Versioning / archive / recovery** | Lesson/unit/class-homepage version history (checkpoints, restore draft-only); archive vs trash; dependency-aware permanent delete + Trash UI — [`design`](superpowers/specs/2026-08-11-versioning-archive-recovery-design.md) / [`plan`](superpowers/plans/2026-08-11-versioning-archive-recovery.md) |
| 2026-08-11 | **Linked template reuse** | Linked composition insert (live draft resolve); Edit Source / Detach; publish expands to independent tree — [`design`](superpowers/specs/2026-08-11-linked-composition-templates-design.md) / [`plan`](superpowers/plans/2026-08-11-linked-composition-templates.md) |
| 2026-08-11 | **AI agent integration** | Lesson editor A4\|AI panel; Ann/Clementine/Hammond/Clare; block/section selection; capability actions; SSE proposals Accept/Reject/Regenerate — [`design`](superpowers/specs/2026-08-11-ai-agent-integration-design.md) |
| 2026-08-11 | **Search / nav acceleration** | Rail search + ⌘K panel; client title/metadata + server body scan; ranked results with snippets — [`design`](superpowers/specs/2026-08-11-search-nav-acceleration-design.md) / [`plan`](superpowers/plans/2026-08-11-search-nav-acceleration.md) |
| 2026-08-10 | **Google Drive / media library uploads** | Hosted uploads + Drive picker mirror + Resources library + publish warnings — [`design`](superpowers/specs/2026-08-10-media-library-drive-design.md) / [`plan`](superpowers/plans/2026-08-10-media-library-drive.md) |
| 2026-08-10 | **A4 print pipeline** | Teacher A4 portrait preview + Print via shared renderer; `response_space` lines; minimal media fallbacks — [`design`](superpowers/specs/2026-08-10-a4-print-pipeline-design.md) / [`plan`](superpowers/plans/2026-08-10-a4-print-pipeline.md) |
| 2026-08-07 | First slice | Auth, lesson draft/publish, `rich_text` / `heading` / `callout`, student lesson view |
| 2026-08-08 | Teacher rail + section shells | Curriculum rail, Units / Lessons / Resources shells |
| 2026-08-08 | Builder blocks (media) | `image`, `video`, `embed`, `html` + publish rules |
| 2026-08-08 | Student published nav | Student chrome / published lesson navigation |
| 2026-08-08 | Teacher home dashboard | Home dashboard foundation |
| 2026-08-08 | Class homepage editor | Class homepage regions as blocks |
| 2026-08-08 | Classes + scheduled lessons | Class ↔ schedule wiring |
| 2026-08-08 | Schedule unit tools | Schedule tools on units |
| 2026-08-08 | Scope & Sequence timeline | Year/unit scope timeline |
| 2026-08-08 | Student schedule prev/next | Adjacent lesson navigation |
| 2026-08-08 | Resource library browse | Browse resources |
| 2026-08-09 | Clinical Glass dashboard + Create | Home tiles, Create flows, Scope year Gantt, rail → class pages |
| 2026-08-09 | Image publish fix | Live-field emit so alt edit doesn’t wipe URL |
| 2026-08-09 | Builder variety | `quote`, `divider`, `definition`, `code`, `audio`, `attachment`, `accordion`, `table`, `question_set` + richer controls |
| 2026-08-09 | **Layout Phase A** | Nested `columns` (4 presets), `section`, `spacer`; recursive schema/render/editor/publish |
| 2026-08-09 | **Timeline** | In-lesson chronology events (`when`/label/description + optional image/link); stacked editor; vertical→horizontal CSS — [`design`](superpowers/specs/2026-08-09-timeline-block-design.md) / [`plan`](superpowers/plans/2026-08-09-timeline-block.md) |
| 2026-08-09 | **Tabs** | Nested `tabs` panels (2–8); columns allowed in panels; stacked editor; student tablist — [`design`](superpowers/specs/2026-08-09-tabs-block-design.md) / [`plan`](superpowers/plans/2026-08-09-tabs-block.md) |
| 2026-08-09 | **Gallery** | Multi-image set (grid / carousel / comparison + lightbox) — [`design`](superpowers/specs/2026-08-09-gallery-block-design.md) / [`plan`](superpowers/plans/2026-08-09-gallery-block.md) |
| 2026-08-09 | **Learning activities pack** | `flashcards`, `cloze`, `self_check` — thin v1 with local student state, flip/shuffle, sized blanks + shuffled word bank — [`design`](superpowers/specs/2026-08-09-learning-activities-pack-design.md) / [`plan`](superpowers/plans/2026-08-09-learning-activities-pack.md) |
| 2026-08-09 | **Visualisation pack** | `chart`, `equation`, `diagram`, `mind_map`, `concept_map` + KaTeX + custom SVG — [`design`](superpowers/specs/2026-08-09-visualisation-pack-design.md) / [`plan`](superpowers/plans/2026-08-09-visualisation-pack.md) |
| 2026-08-09 | **Collection** | Unit lessons + recent on class homepage — [`design`](superpowers/specs/2026-08-09-collection-block-design.md) / [`plan`](superpowers/plans/2026-08-09-collection-block.md) |
| 2026-08-09 | **HTML app** | Sandboxed inline `html_app` + optional laned OpenAI/Anthropic proxy — [`design`](superpowers/specs/2026-08-09-html-app-design.md) / [`plan`](superpowers/plans/2026-08-09-html-app.md) |
| 2026-08-09 | **Builder UX** | Columns: Custom 12-grid widths + Move-to / HTML5 DnD between columns — [`design`](superpowers/specs/2026-08-09-builder-ux-columns-design.md) / [`plan`](superpowers/plans/2026-08-09-builder-ux-columns.md) |
| 2026-08-09 | **Response space** | `response_space` on short-answer `question_set` items (schema + builder); student UI unchanged; print deferred — [`design`](superpowers/specs/2026-08-09-response-space-design.md) / [`plan`](superpowers/plans/2026-08-09-response-space.md) |
| 2026-08-09 | **Embed viewers** | Map / Slides / Document / PDF via provider-aware `embed` (menu presets + URL detect; iframe vs card) — [`design`](superpowers/specs/2026-08-09-embed-viewers-design.md) / [`plan`](superpowers/plans/2026-08-09-embed-viewers.md) |
| 2026-08-09 | **Templates & reuse** | Composition save/insert (section → independent copy); no linked templates yet — [`design`](superpowers/specs/2026-08-09-templates-reuse-design.md) / [`plan`](superpowers/plans/2026-08-09-templates-reuse.md) |

### Block types live today (32)

`rich_text`, `heading`, `callout`, `image`, `video`, `embed`, `html`, `html_app`, `quote`, `divider`, `definition`, `code`, `audio`, `attachment`, `accordion`, `table`, `question_set`, `columns`, `section`, `spacer`, `timeline`, `tabs`, `gallery`, `flashcards`, `cloze`, `self_check`, `chart`, `equation`, `diagram`, `mind_map`, `concept_map`, `collection`

### Product phases (rough map)

| Spec phase | Status |
|------------|--------|
| 0–4 Foundation → basic builder → publish | Done (core) |
| 5 Block system expansion | **In progress** — layout + timeline + tabs + gallery + activities + viz + collection + html_app + columns UX + response space + embed viewers + A4 print v1 done |
| 6–8 Unit/class pages, scheduling, scope | Done for v1 (+ Clinical Glass class/unit refresh) |
| 9 A4 print | **v1 done** — preview + print; metadata/tools polish later |
| 10 Google Drive | **v1 done** — mirror + picker + library |
| 11 Templates / reuse | **Done (v1)** — lesson/unit templates + compositions + linked reuse |
| 12 Search | **v1 done** — rail + ⌘K panel; client titles + server body scan |
| 13 AI | **v1 done** — agent panel + block/section proposals; composition/whole-lesson later |
| 14–15 Versioning / hardening | **Phase 14 core done** — history + archive/trash/restore/permanent delete; export/backup + Phase 15 hardening still ahead |
---

## Projection (backlog — block-focused)

Unchecked = not built yet.

### Structure / layout
- [x] Section, Columns, Spacer (Phase A — nested model)
- [x] Tabs
- [x] Collection (navigation / resource lists)
- [x] Columns UX: drag between columns; non-preset widths

### Content / media (remaining)
- [x] Timeline (in-lesson)
- [x] Gallery
- [x] Map / Slides / Document viewer behaviours (as needed)
- [x] `html_app` (sandboxed apps)

### Learning activities
- [x] Flashcards
- [x] Cloze
- [x] Self check
- [x] Response space (schema + builder on short-answer; print lines in A4 pipeline)

### Visualisation
- [x] Chart
- [x] Equation (standalone)
- [x] Diagram
- [x] Mind map
- [x] Concept map

### Platform (later)
- [x] A4 print pipeline
- [x] Media library + uploads / Drive
- [x] Templates & compositions (compositions + lesson/unit templates + linked reuse)
- [x] Search
- [x] AI agent
- [x] Versioning / archive / recovery

---

## Latest note

**2026-08-11** — Versioning / archive / recovery core shipped (history panel, trash, dependency-aware permanent delete). AI agent panel + covers WIP restored onto main. Next up: AI composition/whole-lesson scope; export/portable backup and Phase 15 hardening remain deferred.