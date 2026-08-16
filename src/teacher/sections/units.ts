import { navigate } from '@/app/router';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import type { Block } from '@/schemas';
import { resolveCoverUrl } from '@/schemas';
import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { createUnitTemplate } from '@/teacher/template-api';
import { mountHistoryPanel } from '@/teacher/history-panel';
import type { Subject, Unit, Year } from '@/schemas';
import { patchUnit } from '@/teacher/unit-api';
import { ApiClientError } from '@/api/client';
import { renderPageHeader } from '@/teacher/page-header';
import { downloadPortableExport } from '@/teacher/export-api';
import { gradientForEntityId, renderEntityBanner } from '@/teacher/entity-banner';
import {
  mountBlockCanvas,
  type BlockCanvasHandle
} from '@/teacher/lesson-canvas/mount-page';
import { mountLessonPalette } from '@/teacher/lesson-canvas/mount-palette';
import { homepagePaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import { readBuilderChromePrefs } from '@/teacher/lesson-canvas/prefs';

export const UNITS_INDEX_GROUP_STORAGE_KEY = 'teaching-hub.units-index-group';
export type UnitsIndexGroupBy = 'subject' | 'year';

function readUnitsIndexGroupBy(): UnitsIndexGroupBy {
  try {
    return localStorage.getItem(UNITS_INDEX_GROUP_STORAGE_KEY) === 'year'
      ? 'year'
      : 'subject';
  } catch {
    return 'subject';
  }
}

function writeUnitsIndexGroupBy(value: UnitsIndexGroupBy): void {
  try {
    localStorage.setItem(UNITS_INDEX_GROUP_STORAGE_KEY, value);
  } catch {
    // Persistence is convenience; ignore quota / private-mode failures.
  }
}

export interface UnitsIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
  onMutated?: () => void | Promise<void>;
}

export interface UnitPageOptions {
  onMutated?: () => void | Promise<void>;
  /** Cover-only invalidation; must not remount the page or its editors. */
  onCoverMutated?: () => void | Promise<void>;
}

export function renderUnitsIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: UnitsIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'units-index__create create-control';
  createHost.dataset.createHost = '';

  const groupByHost = document.createElement('div');
  groupByHost.className = 'units-index__group-by';
  groupByHost.setAttribute('role', 'group');
  groupByHost.setAttribute('aria-label', 'Group units by');

  renderPageHeader(canvas, {
    eyebrow: 'Workspace',
    title: 'Units',
    actions: [groupByHost, createHost]
  });

  const createControl = mountCreateControl(createHost, {
    context: 'units',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const units = curriculum.units
    .filter((unit) => unit.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title));

  const root = document.createElement('div');
  root.className = 'units-index';
  canvas.append(root);

  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No units yet.';
    root.append(empty);
    return {
      dispose: () => {
        for (const dispose of disposers.splice(0).reverse()) dispose();
      }
    };
  }

  let groupBy = readUnitsIndexGroupBy();

  const subjectBtn = document.createElement('button');
  subjectBtn.type = 'button';
  subjectBtn.className = 'units-index__group-by-btn';
  subjectBtn.dataset.unitsGroup = 'subject';
  subjectBtn.textContent = 'Subject';

  const yearBtn = document.createElement('button');
  yearBtn.type = 'button';
  yearBtn.className = 'units-index__group-by-btn';
  yearBtn.dataset.unitsGroup = 'year';
  yearBtn.textContent = 'Year level';

  groupByHost.append(subjectBtn, yearBtn);

  const listHost = document.createElement('div');
  listHost.className = 'units-index__list';
  root.append(listHost);

  function syncGroupButtons(): void {
    subjectBtn.setAttribute('aria-pressed', groupBy === 'subject' ? 'true' : 'false');
    yearBtn.setAttribute('aria-pressed', groupBy === 'year' ? 'true' : 'false');
    subjectBtn.classList.toggle('units-index__group-by-btn--active', groupBy === 'subject');
    yearBtn.classList.toggle('units-index__group-by-btn--active', groupBy === 'year');
  }

  function renderGroupedList(): void {
    listHost.replaceChildren();
    const groups = groupUnits(units, groupBy, yearsById, subjectsById);
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'units-index__group';

      const heading = document.createElement('h2');
      heading.className = 'units-index__group-title';
      heading.textContent = group.label;

      const grid = document.createElement('div');
      grid.className = 'home-classes units-index__grid';

      for (const unit of group.units) {
        grid.append(renderUnitTile(unit, yearsById, subjectsById, curriculum.media));
      }

      section.append(heading, grid);
      listHost.append(section);
    }
  }

  subjectBtn.addEventListener('click', () => {
    if (groupBy === 'subject') return;
    groupBy = 'subject';
    writeUnitsIndexGroupBy(groupBy);
    syncGroupButtons();
    renderGroupedList();
  });
  yearBtn.addEventListener('click', () => {
    if (groupBy === 'year') return;
    groupBy = 'year';
    writeUnitsIndexGroupBy(groupBy);
    syncGroupButtons();
    renderGroupedList();
  });

  syncGroupButtons();
  renderGroupedList();

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

type UnitGroup = { key: string; label: string; sort: number; units: Unit[] };

function groupUnits(
  units: Unit[],
  groupBy: UnitsIndexGroupBy,
  yearsById: Map<string, Year>,
  subjectsById: Map<string, Subject>
): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();

  for (const unit of units) {
    const year = yearsById.get(unit.year_id);
    const subject = subjectsById.get(unit.subject_id);
    const key =
      groupBy === 'year'
        ? (year?.id ?? 'ungrouped')
        : subject?.title.trim() || 'Ungrouped';
    const label =
      groupBy === 'year' ? (year?.title ?? 'Ungrouped') : subject?.title.trim() || 'Ungrouped';
    const sort = groupBy === 'year' ? (year?.year_level ?? Number.MAX_SAFE_INTEGER) : 0;
    const existing = groups.get(key);
    if (existing) {
      existing.units.push(unit);
    } else {
      groups.set(key, { key, label, sort, units: [unit] });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.label.localeCompare(b.label);
  });

  for (const group of ordered) {
    group.units.sort((a, b) => {
      if (groupBy === 'subject') {
        const yearA = yearsById.get(a.year_id)?.year_level ?? 0;
        const yearB = yearsById.get(b.year_id)?.year_level ?? 0;
        if (yearA !== yearB) return yearA - yearB;
      }
      return a.title.localeCompare(b.title);
    });
  }

  return ordered;
}

function renderUnitTile(
  unit: Unit,
  yearsById: Map<string, Year>,
  subjectsById: Map<string, Subject>,
  media: CurriculumResponse['media']
): HTMLAnchorElement {
  const subject = subjectsById.get(unit.subject_id);
  const year = yearsById.get(unit.year_id);
  const path = `/units/${unit.id}`;

  const tile = document.createElement('a');
  tile.className = 'glass-tile home-class-tile entity-cover-tile units-index__tile';
  tile.href = path;
  tile.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });

  const mediaEl = document.createElement('div');
  mediaEl.className = 'entity-cover-tile__media';
  const coverUrl = resolveCoverUrl(unit.cover, media);
  if (coverUrl) {
    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = '';
    mediaEl.append(img);
  } else {
    mediaEl.style.background = gradientForEntityId(unit.id);
  }

  const body = document.createElement('div');
  body.className = 'entity-cover-tile__body';

  const title = document.createElement('p');
  title.className = 'units-index__title';
  title.textContent = unit.title;

  const meta = document.createElement('p');
  meta.className = 'units-index__meta';
  meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

  body.append(title, meta);
  tile.append(mediaEl, body);
  return tile;
}

/** @deprecated Prefer renderUnitPage */
export function renderUnitStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string
): void {
  renderUnitPage(canvas, curriculum, unitId);
}

export function renderUnitPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string,
  options: UnitPageOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();
  const unit = curriculum.units.find((entry) => entry.id === unitId);

  if (!unit) {
    renderPageHeader(canvas, { eyebrow: 'Units', title: 'Unit not found' });
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Unit not found.';
    canvas.append(status);
    return { dispose: () => undefined };
  }

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn--secondary';
  exportBtn.dataset.export = 'unit';
  exportBtn.textContent = 'Export JSON';
  exportBtn.addEventListener('click', () => {
    void downloadPortableExport('unit', unit.id, unit.slug).catch(() => {
      window.alert('Unable to export this unit.');
    });
  });

  const pageHeader = renderPageHeader(canvas, {
    eyebrow: 'Units',
    title: unit.title,
    actions: [exportBtn]
  });
  const heading = pageHeader.querySelector('.page-header__title');

  const root = document.createElement('div');
  root.className = 'unit-page';

  const coverHost = document.createElement('div');
  coverHost.className = 'unit-page__cover';
  const yearTitle = curriculum.years.find((entry) => entry.id === unit.year_id)?.title;
  const subjectTitle = curriculum.subjects.find((entry) => entry.id === unit.subject_id)?.title;
  const banner = renderEntityBanner(coverHost, {
    cover: unit.cover,
    media: curriculum.media,
    title: unit.title,
    eyebrow: [yearTitle, subjectTitle].filter(Boolean).join(' · '),
    entityId: unit.id,
    editable: true,
    onSave: async (cover) => {
      const saved = await patchUnit(unit.id, { cover });
      if (saved.cover) unit.cover = saved.cover;
      else delete unit.cover;
      await options.onCoverMutated?.();
    }
  });

  const planSection = document.createElement('section');
  planSection.className = 'unit-page__plan glass-panel';
  planSection.dataset.unitSection = 'plan';

  const planHeading = document.createElement('h2');
  planHeading.className = 'class-page__heading';
  planHeading.textContent = 'Unit plan';

  const planHost = document.createElement('div');
  planHost.className = 'unit-page__plan-editor';

  const planEditor = mountUnitPlanEditor(planHost, unit.blocks ?? [], {
    onSave: async (blocks) => {
      await patchUnit(unit.id, { blocks });
      await options.onMutated?.();
    }
  });

  planSection.append(planHeading, planHost);

  const lessonsSection = document.createElement('section');
  lessonsSection.className = 'unit-page__lessons glass-panel';
  lessonsSection.dataset.unitSection = 'lessons';

  const lessonsHeading = document.createElement('h2');
  lessonsHeading.className = 'class-page__heading';
  lessonsHeading.textContent = 'Lessons';
  lessonsSection.append(lessonsHeading);

  const tools = document.createElement('div');
  tools.className = 'unit-stub__tools';

  const saveTemplate = document.createElement('button');
  saveTemplate.type = 'button';
  saveTemplate.className = 'btn btn--secondary';
  saveTemplate.textContent = 'Save as unit template';
  saveTemplate.addEventListener('click', () => {
    void (async () => {
      const suggested = unit.title.trim() || 'Unit template';
      const title = window.prompt('Unit template name', suggested);
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed) {
        window.alert('Unit template name is required.');
        return;
      }
      try {
        await createUnitTemplate({
          title: trimmed,
          description: unit.description,
          blocks: unit.blocks ? cloneBlocksWithNewIds(unit.blocks) : undefined
        });
        window.alert(`Saved “${trimmed}” as a unit template.`);
      } catch {
        window.alert('Unable to save unit template.');
      }
    })();
  });

  const historyHost = document.createElement('div');
  historyHost.className = 'history-panel-host unit-stub__history';

  tools.append(saveTemplate, historyHost);
  const historyPanel = mountHistoryPanel({
    kind: 'unit',
    parentId: unitId,
    host: historyHost,
    onRestored: (live) => {
      const restored = live as Unit;
      Object.assign(unit, restored);
      // Object.assign cannot clear an optional key the restored unit omits,
      // which would otherwise leave a phantom cover behind.
      if (restored.cover) unit.cover = restored.cover;
      else delete unit.cover;
      if (heading) heading.textContent = unit.title;
      banner.update({ title: unit.title, cover: unit.cover ?? null });
    }
  });

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.unit_id === unitId && lesson.status === 'active')
    .sort((a, b) => a.sequence - b.sequence);

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'class-page__empty';
    empty.textContent = 'No lessons in this unit yet.';
    lessonsSection.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'lesson-list';

    for (const lesson of lessons) {
      const item = document.createElement('li');
      item.className = 'lesson-list__item';

      const info = document.createElement('div');
      info.className = 'lesson-list__info';

      const title = document.createElement('p');
      title.className = 'lesson-list__title';
      title.textContent = lesson.title;

      const meta = document.createElement('p');
      meta.className = 'lesson-list__meta';
      meta.textContent = lesson.published ? 'Published' : 'Draft';

      info.append(title, meta);

      const path = `/lessons/${lesson.id}`;
      const open = document.createElement('a');
      open.className = 'btn btn--secondary lesson-list__open';
      open.href = path;
      open.textContent = 'Open';
      open.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(path);
      });

      item.append(info, open);
      list.append(item);
    }

    lessonsSection.append(list);
  }

  root.append(coverHost, tools, planSection, lessonsSection);
  canvas.append(root);

  return {
    dispose: () => {
      historyPanel.dispose();
      banner.dispose();
      planEditor.dispose();
    }
  };
}

function mountUnitPlanEditor(
  host: HTMLElement,
  initialBlocks: Block[],
  options: { onSave: (blocks: Block[]) => Promise<void> }
): { dispose: () => void } {
  let blocks = structuredClone(initialBlocks);
  let blockCounter = blocks.length;
  let destroyed = false;

  const root = document.createElement('div');
  root.className = 'unit-plan-editor lesson-builder lesson-builder--no-chat';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const railHost = document.createElement('div');
  railHost.className = 'lesson-builder__rail';

  const pageCol = document.createElement('div');
  pageCol.className = 'lesson-builder__page';

  const toolbar = document.createElement('div');
  toolbar.className = 'unit-plan-editor__toolbar';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--primary';
  saveButton.textContent = 'Save plan';

  toolbar.append(saveButton);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'unit-plan-editor__blocks';

  pageCol.append(errorBanner, toolbar, canvasHost);
  root.append(railHost, pageCol);
  host.replaceChildren(root);

  const canvas: BlockCanvasHandle = mountBlockCanvas(canvasHost, {
    blocks,
    allowCollectionAtRoot: true,
    idFactory: () => {
      blockCounter += 1;
      return `block_unit_${blockCounter}`;
    },
    onChange: (next) => {
      blocks = next;
    }
  });

  const palette = mountLessonPalette(railHost, {
    families: homepagePaletteFamilies(),
    onInsert: (payload) => {
      if (payload.kind !== 'block') return;
      canvas.insertType(payload.type);
    },
    onShelved: (shelved) => {
      root.classList.toggle('lesson-builder--rail-shelved', shelved);
    }
  });

  if (readBuilderChromePrefs().rail === 'shelved') {
    palette.setShelved(true);
    root.classList.add('lesson-builder--rail-shelved');
  }

  saveButton.addEventListener('click', () => {
    if (destroyed) return;
    errorBanner.hidden = true;
    saveButton.disabled = true;
    void options
      .onSave(structuredClone(blocks))
      .catch((error: unknown) => {
        errorBanner.hidden = false;
        errorBanner.textContent =
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unable to save unit plan.';
      })
      .finally(() => {
        saveButton.disabled = false;
      });
  });

  return {
    dispose: () => {
      destroyed = true;
      palette.dispose();
      canvas.dispose();
      host.replaceChildren();
    }
  };
}
