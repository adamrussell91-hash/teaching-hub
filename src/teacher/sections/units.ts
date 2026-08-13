import { navigate } from '@/app/router';
import {
  HOMEPAGE_BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  createFromInsertMenu,
  expandGroupTypesForMenu,
  type InsertMenuValue
} from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/registry';
import type { Block } from '@/schemas';
import { resolveCoverUrl } from '@/schemas';
import { mountCoverPicker } from '@/teacher/cover-picker';
import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { createUnitTemplate } from '@/teacher/template-api';
import { mountHistoryPanel } from '@/teacher/history-panel';
import {
  confirmAndArchive,
  confirmAndTrash,
  entityPath
} from '@/teacher/lifecycle-api';
import type { Unit } from '@/schemas';
import { patchUnit } from '@/teacher/unit-api';
import { ApiClientError } from '@/api/client';
import { renderPageHeader } from '@/teacher/page-header';
export interface UnitsIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
  onMutated?: () => void | Promise<void>;
}

export interface UnitPageOptions {
  onMutated?: () => void | Promise<void>;
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

  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Units', actions: [createHost] });

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

  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No units yet.';
    canvas.append(empty);
    return {
      dispose: () => {
        for (const dispose of disposers.splice(0).reverse()) dispose();
      }
    };
  }

  const grid = document.createElement('div');
  grid.className = 'home-classes units-index__grid';

  for (const unit of units) {
    const subject = subjectsById.get(unit.subject_id);
    const year = yearsById.get(unit.year_id);
    const path = `/units/${unit.id}`;

    const card = document.createElement('div');
    card.className = 'units-index__card';

    const tile = document.createElement('a');
    tile.className = 'glass-tile home-class-tile entity-cover-tile';
    tile.href = path;
    tile.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    const coverUrl = resolveCoverUrl(unit.cover, curriculum.media);
    if (coverUrl) {
      const media = document.createElement('div');
      media.className = 'entity-cover-tile__media';
      const img = document.createElement('img');
      img.src = coverUrl;
      img.alt = '';
      media.append(img);
      tile.append(media);
    }

    const body = document.createElement('div');
    body.className = 'entity-cover-tile__body';

    const title = document.createElement('p');
    title.className = 'home-class-tile__title';
    title.textContent = unit.title;

    const meta = document.createElement('p');
    meta.className = 'home-class-tile__eyebrow';
    meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

    body.append(title, meta);
    tile.append(body);

    const actions = document.createElement('div');
    actions.className = 'list-row-actions';

    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'btn btn--ghost';
    archive.textContent = 'Archive';
    archive.addEventListener('click', () => {
      void (async () => {
        try {
          const ok = await confirmAndArchive(entityPath('unit', unit.id), unit.title);
          if (ok) await options.onMutated?.();
        } catch {
          window.alert('Unable to archive unit.');
        }
      })();
    });

    const trash = document.createElement('button');
    trash.type = 'button';
    trash.className = 'btn btn--ghost';
    trash.textContent = 'Trash';
    trash.addEventListener('click', () => {
      void (async () => {
        try {
          const ok = await confirmAndTrash('unit', unit.id, unit.title);
          if (ok) await options.onMutated?.();
        } catch {
          window.alert('Unable to move unit to trash.');
        }
      })();
    });

    actions.append(archive, trash);
    card.append(tile, actions);
    grid.append(card);
  }

  canvas.append(grid);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
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

  const pageHeader = renderPageHeader(canvas, { eyebrow: 'Units', title: unit.title });
  const heading = pageHeader.querySelector('.page-header__title');

  const root = document.createElement('div');
  root.className = 'unit-page';

  const header = document.createElement('header');
  header.className = 'unit-page__header glass-panel';

  const coverHost = document.createElement('div');
  coverHost.className = 'unit-page__cover';
  mountCoverPicker(coverHost, {
    cover: unit.cover,
    media: curriculum.media,
    titleFallback: unit.title,
    onSave: async (cover) => {
      await patchUnit(unit.id, { cover });
      await options.onMutated?.();
    }
  });

  header.append(coverHost);

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
  mountHistoryPanel({
    kind: 'unit',
    parentId: unitId,
    host: historyHost,
    onRestored: (live) => {
      const restored = live as Unit;
      Object.assign(unit, restored);
      if (heading) heading.textContent = unit.title;
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

  root.append(header, tools, planSection, lessonsSection);
  canvas.append(root);

  return {
    dispose: () => {
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
  root.className = 'unit-plan-editor';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const toolbar = document.createElement('div');
  toolbar.className = 'unit-plan-editor__toolbar';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--primary';
  saveButton.textContent = 'Save plan';

  const addSelect = document.createElement('select');
  addSelect.className = 'unit-plan-editor__add-select';
  for (const group of HOMEPAGE_BLOCK_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const type of expandGroupTypesForMenu(group.types)) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = INSERT_MENU_LABEL[type];
      optgroup.append(opt);
    }
    addSelect.append(optgroup);
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary';
  addButton.textContent = 'Add block';

  toolbar.append(addSelect, addButton, saveButton);

  const blocksContainer = document.createElement('div');
  blocksContainer.className = 'unit-plan-editor__blocks';

  const preview = document.createElement('div');
  preview.className = 'unit-plan-editor__preview';
  preview.hidden = true;

  root.append(errorBanner, toolbar, blocksContainer, preview);
  host.replaceChildren(root);

  function renderBlocks(): void {
    blocksContainer.replaceChildren();
    if (blocks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'class-page__empty';
      empty.textContent = 'No plan blocks yet. Add headings, text, images, and more.';
      blocksContainer.append(empty);
      return;
    }

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'unit-plan-editor__block-row';

      const controls = document.createElement('div');
      controls.className = 'unit-plan-editor__block-controls';

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const tmp = blocks[index]!;
        blocks[index] = blocks[index - 1]!;
        blocks[index - 1] = tmp;
        renderBlocks();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost';
      down.textContent = '↓';
      down.disabled = index === blocks.length - 1;
      down.addEventListener('click', () => {
        if (index >= blocks.length - 1) return;
        const tmp = blocks[index]!;
        blocks[index] = blocks[index + 1]!;
        blocks[index + 1] = tmp;
        renderBlocks();
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        blocks.splice(index, 1);
        renderBlocks();
      });

      controls.append(up, down, del);

      const editor = createBlockEditor(
        block,
        (updated) => {
          blocks[index] = updated;
        },
        () => blocks[index]!
      );

      row.append(controls, editor);
      blocksContainer.append(row);
    });
  }

  addButton.addEventListener('click', () => {
    blockCounter += 1;
    blocks.push(createFromInsertMenu(addSelect.value as InsertMenuValue, `block_unit_${blockCounter}`));
    renderBlocks();
  });

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

  renderBlocks();

  return {
    dispose: () => {
      destroyed = true;
      host.replaceChildren();
    }
  };
}
