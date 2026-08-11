import { navigate } from '@/app/router';
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

export interface UnitsIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
  onMutated?: () => void | Promise<void>;
}

export function renderUnitsIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: UnitsIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const header = document.createElement('header');
  header.className = 'units-index__header';

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Units';

  const createHost = document.createElement('div');
  createHost.className = 'units-index__create create-control';
  createHost.dataset.createHost = '';

  header.append(heading, createHost);

  const createControl = mountCreateControl(createHost, {
    context: 'units',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  canvas.append(header);

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

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const unit of units) {
    const subject = subjectsById.get(unit.subject_id);
    const year = yearsById.get(unit.year_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = unit.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'list-row-actions';

    const path = `/units/${unit.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

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

    actions.append(open, archive, trash);
    item.append(info, actions);
    list.append(item);
  }

  canvas.append(list);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

export function renderUnitStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string
): void {
  canvas.replaceChildren();
  const unit = curriculum.units.find((entry) => entry.id === unitId);

  if (!unit) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Unit not found.';
    canvas.append(status);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = unit.title;
  canvas.append(heading);

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
  canvas.append(tools);

  mountHistoryPanel({
    kind: 'unit',
    parentId: unitId,
    host: historyHost,
    onRestored: (live) => {
      const restored = live as Unit;
      Object.assign(unit, restored);
      heading.textContent = unit.title;
    }
  });

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.unit_id === unitId && lesson.status === 'active')
    .sort((a, b) => a.sequence - b.sequence);

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons in this unit yet.';
    canvas.append(empty);
    return;
  }

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

  canvas.append(list);
}
