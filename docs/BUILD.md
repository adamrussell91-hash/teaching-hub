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

1. **Learning activities pack** — flashcards, cloze, self_check  
2. **Visualisation pack** — chart, equation (diagram / mind_map / concept_map after)  
3. **Structure: Collection** — nav / resource collections  
4. **html_app** — sandboxed interactive HTML apps (separate from sanitised `html`)  
5. **Builder UX** — drag-and-drop between columns; free-form column widths  

Larger product tracks (not “next block”, but still ahead):

- A4 print render  
- Google Drive / media library uploads  
- Templates & reuse  
- Search / nav acceleration  
- AI agent integration  
- Versioning, archive, recovery  

---

## Shipped (History)

| Date | Slice | Outcome |
|------|--------|---------|
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

### Block types live today (22)

`rich_text`, `heading`, `callout`, `image`, `video`, `embed`, `html`, `quote`, `divider`, `definition`, `code`, `audio`, `attachment`, `accordion`, `table`, `question_set`, `columns`, `section`, `spacer`, `timeline`, `tabs`, `gallery`

### Product phases (rough map)

| Spec phase | Status |
|------------|--------|
| 0–4 Foundation → basic builder → publish | Done (core) |
| 5 Block system expansion | **In progress** — layout + timeline + tabs + gallery done; activities/viz remain |
| 6–8 Unit/class pages, scheduling, scope | Largely done for v1 |
| 9 A4 print | Not started |
| 10 Google Drive | Not started |
| 11 Templates / reuse | Not started |
| 12 Search | Not started |
| 13 AI | Not started |
| 14–15 Versioning / hardening | Not started |

---

## Projection (backlog — block-focused)

Unchecked = not built yet.

### Structure / layout
- [x] Section, Columns, Spacer (Phase A — nested model)
- [x] Tabs
- [ ] Collection (navigation / resource lists)
- [ ] Columns UX: drag between columns; non-preset widths

### Content / media (remaining)
- [x] Timeline (in-lesson)
- [x] Gallery
- [ ] Map / Slides / Document viewer behaviours (as needed)
- [ ] `html_app` (sandboxed apps)

### Learning activities
- [ ] Flashcards
- [ ] Cloze
- [ ] Self check
- [ ] Response space (if still distinct from question_set)

### Visualisation
- [ ] Chart
- [ ] Equation (standalone)
- [ ] Diagram
- [ ] Mind map
- [ ] Concept map

### Platform (later)
- [ ] A4 print pipeline
- [ ] Media library + uploads / Drive
- [ ] Templates & compositions
- [ ] Search
- [ ] AI agent
- [ ] Versioning / archive / recovery

---

## Latest note

**2026-08-09** — Gallery + Tabs merged with Timeline already on main (grid/carousel/comparison + lightbox; nested tab panels; in-lesson chronology). Next builder slice: **Learning activities pack** unless priority shifts.
