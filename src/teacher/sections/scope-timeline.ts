import { navigate } from '@/app/router';
import type { ScopeSequence, TimelineItem, Unit } from '@/schemas';
import { findFirstFreeStart, weeksToLabel } from '@/scope/timeline-weeks';
import type { CurriculumResponse } from '@/teacher/nav';
import { patchScopeSequence } from '@/teacher/scope-api';

export interface ScopeTimelineEditorOptions {
  onPatched?: (scope: ScopeSequence) => void;
}

const UNIT_SPAN = 4;

function itemLabel(
  item: TimelineItem,
  unitsById: Map<string, { title: string }>
): string {
  if (item.kind === 'note') return item.title;
  return unitsById.get(item.unit_id)?.title ?? 'Unknown unit';
}

function positionStyle(startWeek: number, endWeek: number, weekCount: number): string {
  const left = ((startWeek - 1) / weekCount) * 100;
  const width = ((endWeek - startWeek + 1) / weekCount) * 100;
  return `left:${left}%;width:${width}%`;
}

function nextOrder(items: TimelineItem[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => item.order)) + 1;
}

function newItemId(): string {
  return `ti_${crypto.randomUUID()}`;
}

function mergeScopeIntoCurriculum(
  curriculum: CurriculumResponse,
  scope: ScopeSequence
): void {
  const idx = curriculum.scope_sequences.findIndex((entry) => entry.id === scope.id);
  if (idx >= 0) {
    curriculum.scope_sequences[idx] = scope;
  } else {
    curriculum.scope_sequences.push(scope);
  }
}

function availableUnits(
  curriculum: CurriculumResponse,
  subjectId: string,
  scope: ScopeSequence
): Unit[] {
  const onTimeline = new Set(
    scope.timeline_items.filter((item) => item.kind === 'unit').map((item) => item.unit_id)
  );
  return curriculum.units
    .filter((unit) => unit.subject_id === subjectId && !onTimeline.has(unit.id))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function renderStatus(canvas: HTMLElement, message: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = message;
  canvas.append(status);
}

function renderEmptyInspector(inspector: HTMLElement): void {
  inspector.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'scope-timeline__inspector-empty';
  empty.textContent = 'Select an item…';
  inspector.append(empty);
}

function openAddUnitPicker(options: {
  units: Unit[];
  onChoose: (unitId: string) => void;
}): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'schedule-modal scope-timeline__picker';
  backdrop.dataset.scopePicker = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'schedule-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'scope-add-unit-title');

  const title = document.createElement('h2');
  title.id = 'scope-add-unit-title';
  title.className = 'schedule-modal__title';
  title.textContent = 'Add Unit';

  const body = document.createElement('div');
  body.className = 'schedule-modal__body';

  const footer = document.createElement('div');
  footer.className = 'schedule-modal__footer';

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  if (options.units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'schedule-modal__empty';
    empty.textContent = 'All subject units are already on this timeline.';
    body.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'schedule-modal__unit-list';
    for (const unit of options.units) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schedule-modal__unit-button scope-timeline__picker-unit';
      button.textContent = unit.title;
      button.addEventListener('click', () => {
        close();
        options.onChoose(unit.id);
      });
      li.append(button);
      list.append(li);
    }
    body.append(list);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  footer.append(cancel);

  dialog.append(title, body, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);
}

export function renderScopeTimelineEditor(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: ScopeTimelineEditorOptions
): void {
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
  if (!subject) {
    renderStatus(canvas, 'Subject not found.');
    return;
  }

  if (!subject.scope_id) {
    renderStatus(canvas, 'Scope & Sequence not found.');
    return;
  }

  const initial = curriculum.scope_sequences.find((entry) => entry.id === subject.scope_id);
  if (!initial) {
    renderStatus(canvas, 'Scope & Sequence not found.');
    return;
  }

  let scope: ScopeSequence = initial;
  let selectedId: string | null = null;
  let saving = false;

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));

  canvas.replaceChildren();

  const root = document.createElement('div');
  root.className = 'scope-timeline';

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = subject.title;

  const toolbar = document.createElement('div');
  toolbar.className = 'scope-timeline__toolbar';

  const addUnit = document.createElement('button');
  addUnit.type = 'button';
  addUnit.className = 'btn btn--secondary scope-timeline__add-unit';
  addUnit.textContent = 'Add Unit';

  const addNote = document.createElement('button');
  addNote.type = 'button';
  addNote.className = 'btn btn--secondary scope-timeline__add-note';
  addNote.textContent = 'Add note';

  toolbar.append(addUnit, addNote);

  const banner = document.createElement('div');
  banner.className = 'scope-timeline__banner';
  banner.hidden = true;
  banner.setAttribute('role', 'alert');

  const body = document.createElement('div');
  body.className = 'scope-timeline__body';

  const main = document.createElement('div');
  main.className = 'scope-timeline__main';

  const termsRow = document.createElement('div');
  termsRow.className = 'scope-timeline__terms';
  termsRow.style.setProperty('--week-count', String(scope.week_count));

  for (const term of scope.terms) {
    const band = document.createElement('div');
    band.className = 'scope-timeline__term';
    band.style.cssText = positionStyle(term.start_week, term.end_week, scope.week_count);
    band.textContent = term.title;
    termsRow.append(band);
  }

  const track = document.createElement('div');
  track.className = 'scope-timeline__track';
  track.style.setProperty('--week-count', String(scope.week_count));

  const weekMarks = document.createElement('div');
  weekMarks.className = 'scope-timeline__week-marks';
  for (let week = 1; week <= scope.week_count; week++) {
    const mark = document.createElement('span');
    mark.className = 'scope-timeline__week-mark';
    mark.textContent = String(week);
    weekMarks.append(mark);
  }

  const itemsLayer = document.createElement('div');
  itemsLayer.className = 'scope-timeline__items';

  const inspector = document.createElement('aside');
  inspector.className = 'scope-timeline__inspector';

  const showBanner = (message: string): void => {
    banner.hidden = false;
    banner.textContent = message;
  };

  const hideBanner = (): void => {
    banner.hidden = true;
    banner.textContent = '';
  };

  const applyScope = (next: ScopeSequence): void => {
    scope = next;
    mergeScopeIntoCurriculum(curriculum, next);
    options?.onPatched?.(next);
  };

  const persistItems = async (items: TimelineItem[]): Promise<boolean> => {
    if (saving) return false;
    saving = true;
    try {
      const updated = await patchScopeSequence(scope.id, { timeline_items: items });
      applyScope(updated);
      hideBanner();
      refreshItems();
      setSelection(selectedId);
      return true;
    } catch {
      showBanner('Unable to save timeline.');
      return false;
    } finally {
      saving = false;
    }
  };

  const renderInspectorContent = (item: TimelineItem): void => {
    inspector.replaceChildren();

    const kind = document.createElement('p');
    kind.className = 'scope-timeline__inspector-kind';
    kind.textContent = item.kind === 'unit' ? 'Unit' : 'Note';

    const weeks = document.createElement('p');
    weeks.className = 'scope-timeline__inspector-weeks';
    weeks.textContent = weeksToLabel(item.start_week, item.end_week);

    inspector.append(kind);

    if (item.kind === 'note') {
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'scope-timeline__note-title scope-timeline__inspector-title';
      titleInput.value = item.title;
      titleInput.setAttribute('aria-label', 'Note title');
      titleInput.addEventListener('blur', () => {
        const nextTitle = titleInput.value.trim() || 'Note';
        if (nextTitle === item.title) return;
        const items = scope.timeline_items.map((entry) =>
          entry.id === item.id && entry.kind === 'note'
            ? { ...entry, title: nextTitle }
            : entry
        );
        void persistItems(items);
      });
      inspector.append(titleInput, weeks);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn--ghost scope-timeline__delete-note';
      deleteBtn.textContent = 'Delete note';
      deleteBtn.addEventListener('click', () => {
        const items = scope.timeline_items.filter((entry) => entry.id !== item.id);
        selectedId = null;
        void persistItems(items);
      });
      inspector.append(deleteBtn);
      return;
    }

    const title = document.createElement('h2');
    title.className = 'scope-timeline__inspector-title';
    title.textContent = itemLabel(item, unitsById);
    inspector.append(title, weeks);

    const open = document.createElement('a');
    open.className = 'btn btn--secondary scope-timeline__open-unit';
    open.href = `/units/${item.unit_id}`;
    open.textContent = 'Open unit';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(`/units/${item.unit_id}`);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost scope-timeline__remove-unit';
    remove.textContent = 'Remove from timeline';
    remove.addEventListener('click', () => {
      const items = scope.timeline_items.filter((entry) => entry.id !== item.id);
      selectedId = null;
      void persistItems(items);
    });

    inspector.append(open, remove);
  };

  const setSelection = (itemId: string | null): void => {
    selectedId = itemId;
    for (const el of itemsLayer.querySelectorAll<HTMLElement>('.scope-timeline__item')) {
      el.classList.toggle('scope-timeline__item--selected', el.dataset.itemId === selectedId);
    }
    const item = scope.timeline_items.find((entry) => entry.id === selectedId);
    if (!item) {
      renderEmptyInspector(inspector);
      return;
    }
    renderInspectorContent(item);
  };

  const refreshItems = (): void => {
    itemsLayer.replaceChildren();
    const sortedItems = [...scope.timeline_items].sort(
      (a, b) => a.order - b.order || a.start_week - b.start_week
    );

    for (const item of sortedItems) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `scope-timeline__item scope-timeline__item--${item.kind}`;
      el.dataset.itemId = item.id;
      el.dataset.kind = item.kind;
      if (item.kind === 'unit') el.dataset.unitId = item.unit_id;
      el.style.cssText = positionStyle(item.start_week, item.end_week, scope.week_count);
      el.textContent = itemLabel(item, unitsById);
      el.setAttribute('aria-label', itemLabel(item, unitsById));

      el.addEventListener('click', () => {
        setSelection(item.id);
      });

      if (item.kind === 'unit') {
        el.addEventListener('dblclick', () => {
          navigate(`/units/${item.unit_id}`);
        });
      }

      itemsLayer.append(el);
    }
  };

  addUnit.addEventListener('click', () => {
    hideBanner();
    openAddUnitPicker({
      units: availableUnits(curriculum, subject.id, scope),
      onChoose: (unitId) => {
        const start = findFirstFreeStart(scope.week_count, UNIT_SPAN, scope.timeline_items);
        if (start === null) {
          showBanner('No free span available for a 4-week unit.');
          return;
        }
        const item: TimelineItem = {
          id: newItemId(),
          kind: 'unit',
          unit_id: unitId,
          start_week: start,
          end_week: start + UNIT_SPAN - 1,
          order: nextOrder(scope.timeline_items)
        };
        selectedId = item.id;
        void persistItems([...scope.timeline_items, item]);
      }
    });
  });

  addNote.addEventListener('click', () => {
    hideBanner();
    const selected = scope.timeline_items.find((entry) => entry.id === selectedId);
    const startWeek = selected?.start_week ?? 1;
    const item: TimelineItem = {
      id: newItemId(),
      kind: 'note',
      title: 'Note',
      start_week: startWeek,
      end_week: startWeek,
      order: nextOrder(scope.timeline_items)
    };
    selectedId = item.id;
    void persistItems([...scope.timeline_items, item]);
  });

  refreshItems();
  renderEmptyInspector(inspector);

  track.append(weekMarks, itemsLayer);
  main.append(termsRow, track);
  body.append(main, inspector);
  root.append(heading, toolbar, banner, body);
  canvas.append(root);
}
