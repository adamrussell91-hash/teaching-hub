import { navigate } from '@/app/router';
import type { ScopeSequence, TimelineItem } from '@/schemas';
import { weeksToLabel } from '@/scope/timeline-weeks';
import type { CurriculumResponse } from '@/teacher/nav';

export interface ScopeTimelineEditorOptions {
  onPatched?: (scope: ScopeSequence) => void;
}

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

function renderInspectorContent(
  inspector: HTMLElement,
  item: TimelineItem,
  unitsById: Map<string, { title: string }>
): void {
  inspector.replaceChildren();

  const kind = document.createElement('p');
  kind.className = 'scope-timeline__inspector-kind';
  kind.textContent = item.kind === 'unit' ? 'Unit' : 'Note';

  const title = document.createElement('h2');
  title.className = 'scope-timeline__inspector-title';
  title.textContent = itemLabel(item, unitsById);

  const weeks = document.createElement('p');
  weeks.className = 'scope-timeline__inspector-weeks';
  weeks.textContent = weeksToLabel(item.start_week, item.end_week);

  inspector.append(kind, title, weeks);

  if (item.kind === 'unit') {
    const open = document.createElement('a');
    open.className = 'btn btn--secondary scope-timeline__open-unit';
    open.href = `/units/${item.unit_id}`;
    open.textContent = 'Open unit';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(`/units/${item.unit_id}`);
    });
    inspector.append(open);
  }
}

export function renderScopeTimelineEditor(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  _options?: ScopeTimelineEditorOptions
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

  const scope = curriculum.scope_sequences.find((entry) => entry.id === subject.scope_id);
  if (!scope) {
    renderStatus(canvas, 'Scope & Sequence not found.');
    return;
  }

  canvas.replaceChildren();

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  let selectedId: string | null = null;

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
  renderEmptyInspector(inspector);

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
    renderInspectorContent(inspector, item, unitsById);
  };

  const sortedItems = [...scope.timeline_items].sort((a, b) => a.order - b.order || a.start_week - b.start_week);

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

  track.append(weekMarks, itemsLayer);
  main.append(termsRow, track);
  body.append(main, inspector);
  root.append(heading, toolbar, banner, body);
  canvas.append(root);
}
