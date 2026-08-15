import { navigate } from '@/app/router';
import type { Lesson } from '@/schemas/lesson';
import { selectTodaySchedule } from '@/teacher/home-model';
import { resolveScheduleToday } from '@/schedule/today';
import {
  confirmAndArchive,
  confirmAndTrash,
  entityPath,
  patchStatus
} from '@/teacher/lifecycle-api';
import type { CurriculumResponse } from '@/teacher/nav';
import { fetchContentSearch } from '@/teacher/search/api';
import { readRecent } from '@/teacher/search/recent';
import { listLessonTemplates, useLessonTemplate } from '@/teacher/template-api';
import { mountHistoryPanel } from '@/teacher/history-panel';
import { duplicateLesson, getLesson, patchLessonLibrary } from './api';
import { duplicateIdSet, findNearDuplicates } from './duplicates';
import { exportUnitPack } from './export-unit';
import { badgeLabel, el, formatLessonCount, formatRelativeTime } from './format';
import { healthFlagLabel, lessonHealthFlags, lessonsNeedingAttention } from './health';
import {
  readCollapsedUnits,
  readPinnedIds,
  readPreferredDensity,
  readPreferredView,
  readSavedViews,
  togglePinned,
  writeCollapsedUnits,
  writePreferredDensity,
  writePreferredView,
  writeSavedViews
} from './prefs';
import { applyLessonsQuery, countActiveFilters, groupLessonsByUnit, lessonBadge } from './query';
import { parseLessonsSearch, serializeLessonsSearch, writeLessonsSearch } from './state';
import { coverageGaps, HSC_ENGLISH_ADVANCED_OUTCOMES } from './syllabus';
import {
  DEFAULT_LESSONS_STATE,
  type LessonLibraryRow,
  type LessonStatusFilter,
  type LessonsListState,
  type LessonsViewMode,
  type SavedLessonView
} from './types';
import { mountVirtualList } from './virtual-list';

const SEARCH_DEBOUNCE_MS = 250;

export interface LessonsLibraryOptions {
  onMutated?: () => void | Promise<void>;
  search?: string;
  now?: Date;
}

function uniqueTags(lessons: LessonLibraryRow[]): string[] {
  const tags = new Set<string>();
  for (const lesson of lessons) for (const tag of lesson.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function uniqueAuthors(lessons: LessonLibraryRow[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const lesson of lessons) {
    if (lesson.author_id) map.set(lesson.author_id, lesson.author_name ?? lesson.author_id);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function selectControl(label: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = el('select', 'lessons-lib__select');
  select.setAttribute('aria-label', label);
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function option(select: HTMLSelectElement, value: string, label: string, selected: boolean): void {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  select.append(node);
}

export function renderLessonsLibrary(
  host: HTMLElement,
  curriculum: CurriculumResponse,
  options: LessonsLibraryOptions = {}
): { dispose: () => void } {
  const now = options.now ?? new Date();
  const preferredView = readPreferredView();
  const preferredDensity = readPreferredDensity();
  let state: LessonsListState = {
    ...parseLessonsSearch(options.search ?? (typeof location !== 'undefined' ? location.search : '')),
    ...(preferredView && !(options.search || (typeof location !== 'undefined' && location.search))
      ? { view: preferredView }
      : {}),
    ...(preferredDensity && !(options.search || (typeof location !== 'undefined' && location.search.includes('density=')))
      ? { density: preferredDensity }
      : {})
  };

  let collapsed = readCollapsedUnits();
  let pins = readPinnedIds();
  let selected = new Set<string>();
  let bodyMatchIds = new Set<string>();
  let searchTimer: number | null = null;
  const disposers: Array<() => void> = [];

  const root = el('div', 'lessons-lib');
  host.replaceChildren(root);

  const countEl = el('p', 'lessons-lib__count');
  countEl.dataset.lessonsCount = '';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'lessons-lib__search';
  search.dataset.lessonsSearch = '';
  search.placeholder = 'Search titles, units, tags, notes…';
  search.setAttribute('aria-label', 'Search lessons');
  search.value = state.q;

  const toolbar = el('div', 'lessons-lib__toolbar');
  const filters = el('div', 'lessons-lib__filters');
  const views = el('div', 'lessons-lib__views');
  views.setAttribute('role', 'tablist');
  views.setAttribute('aria-label', 'Lesson views');

  const bulk = el('div', 'lessons-lib__bulk');
  bulk.hidden = true;
  const listHost = el('div', 'lessons-lib__list');
  const side = el('aside', 'lessons-lib__side');
  side.hidden = true;

  const rail = el('div', 'lessons-lib__rail');

  root.append(countEl, rail, toolbar, bulk, listHost, side);

  const unitSelect = selectControl('Filter by unit', (value) => {
    selected = new Set();
    patchState({ units: value ? [value] : [] });
  });
  const statusSelect = selectControl('Filter by status', (value) => {
    selected = new Set();
    patchState({ statuses: value ? [value as LessonStatusFilter] : [] });
  });
  const tagSelect = selectControl('Filter by tag', (value) => {
    selected = new Set();
    patchState({ tags: value ? [value] : [] });
  });
  const sortSelect = selectControl('Sort lessons', (value) => {
    patchState({ sort: value as LessonsListState['sort'] });
  });
  const smartSelect = selectControl('Smart filter', (value) => {
    selected = new Set();
    patchState({
      smart: value === '' ? null : (value as NonNullable<LessonsListState['smart']>)
    });
  });

  const densitySelect = selectControl('Card density', (value) => {
    const density = value === 'compact' ? 'compact' : 'cards';
    writePreferredDensity(density);
    patchState({ density });
  });

  filters.append(unitSelect, statusSelect, tagSelect, sortSelect, smartSelect, densitySelect);
  toolbar.append(search, filters, views);

  const viewModes: Array<{ id: LessonsViewMode; label: string }> = [
    { id: 'library', label: 'Library' },
    { id: 'table', label: 'Table' },
    { id: 'map', label: 'Map' },
    { id: 'mine', label: 'My views' }
  ];
  for (const mode of viewModes) {
    const btn = el('button', 'lessons-lib__view-btn', mode.label);
    btn.type = 'button';
    btn.dataset.view = mode.id;
    btn.addEventListener('click', () => {
      writePreferredView(mode.id);
      patchState({ view: mode.id });
    });
    views.append(btn);
  }

  const onSlash = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    event.preventDefault();
    search.focus();
  };
  document.addEventListener('keydown', onSlash);
  disposers.push(() => document.removeEventListener('keydown', onSlash));

  search.addEventListener('input', () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      selected = new Set();
      patchState({ q: search.value });
      void refreshBodyMatches(search.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  async function refreshBodyMatches(q: string): Promise<void> {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      bodyMatchIds = new Set();
      paintList();
      return;
    }
    try {
      const result = await fetchContentSearch(trimmed);
      bodyMatchIds = new Set(
        result.hits.filter((hit) => hit.type === 'lesson').map((hit) => hit.id)
      );
    } catch {
      bodyMatchIds = new Set();
    }
    paintList();
  }

  function patchState(partial: Partial<LessonsListState>): void {
    state = { ...state, ...partial, savedViewId: partial.savedViewId ?? null };
    writeLessonsSearch(state);
    paint();
  }

  function extraSets() {
    const recentIds = new Set(readRecent().filter((item) => item.type === 'lesson').map((item) => item.id));
    const healthIds = lessonsNeedingAttention(curriculum.lessons, now, recentIds);
    const duplicateIds = duplicateIdSet(findNearDuplicates(curriculum.lessons));
    const today = resolveScheduleToday(curriculum.schedule_anchor_date);
    const todayIds = new Set(
      selectTodaySchedule(curriculum.scheduled_lessons, today).map((row) => row.lesson_id)
    );
    return { healthIds, duplicateIds, todayIds, bodyMatchIds, recentIds };
  }

  function query() {
    return applyLessonsQuery(curriculum, state, extraSets());
  }

  function fillSelects(): void {
    unitSelect.replaceChildren();
    option(unitSelect, '', 'All units', state.units.length === 0);
    for (const unit of [...curriculum.units].sort((a, b) => a.title.localeCompare(b.title))) {
      option(unitSelect, unit.id, unit.title, state.units.includes(unit.id));
    }
    statusSelect.replaceChildren();
    option(statusSelect, '', 'Active (draft + published)', state.statuses.length === 0);
    option(statusSelect, 'draft', 'Draft', state.statuses.includes('draft'));
    option(statusSelect, 'published', 'Published', state.statuses.includes('published'));
    option(statusSelect, 'needs_review', 'Needs review', state.statuses.includes('needs_review'));
    option(statusSelect, 'archived', 'Archived', state.statuses.includes('archived'));
    tagSelect.replaceChildren();
    option(tagSelect, '', 'All tags', state.tags.length === 0);
    for (const tag of uniqueTags(curriculum.lessons)) {
      option(tagSelect, tag, tag, state.tags.includes(tag));
    }
    sortSelect.replaceChildren();
    const sorts: Array<[LessonsListState['sort'], string]> = [
      ['edited_desc', 'Last edited · newest'],
      ['edited_asc', 'Last edited · oldest'],
      ['title_asc', 'Title A–Z'],
      ['title_desc', 'Title Z–A'],
      ['created_desc', 'Date created · newest'],
      ['created_asc', 'Date created · oldest'],
      ['status', 'Status']
    ];
    for (const [value, label] of sorts) option(sortSelect, value, label, state.sort === value);
    smartSelect.replaceChildren();
    option(smartSelect, '', 'All lessons', !state.smart);
    option(smartSelect, 'health', 'Needs attention', state.smart === 'health');
    option(smartSelect, 'duplicates', 'Possible duplicates', state.smart === 'duplicates');
    option(smartSelect, 'today', 'On today\'s timetable', state.smart === 'today');
    densitySelect.replaceChildren();
    option(densitySelect, 'cards', 'Cards', state.density === 'cards');
    option(densitySelect, 'compact', 'Compact', state.density === 'compact');
  }

  function paintRail(): void {
    rail.replaceChildren();
    const recent = readRecent()
      .filter((item) => item.type === 'lesson')
      .slice(0, 8);
    if (recent.length === 0) return;
    const heading = el('p', 'lessons-lib__rail-label', 'Recently opened');
    const strip = el('div', 'lessons-lib__recent');
    for (const item of recent) {
      const link = el('a', 'lessons-lib__recent-chip', item.title);
      link.href = `/lessons/${item.id}`;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(`/lessons/${item.id}`);
      });
      strip.append(link);
    }
    rail.append(heading, strip);
  }

  function paintViews(): void {
    for (const btn of views.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      btn.setAttribute('aria-selected', btn.dataset.view === state.view ? 'true' : 'false');
    }
  }

  function paintBulk(rows: LessonLibraryRow[]): void {
    bulk.replaceChildren();
    const visible = new Set(rows.map((row) => row.id));
    selected = new Set([...selected].filter((id) => visible.has(id)));
    if (selected.size === 0) {
      bulk.hidden = true;
      return;
    }
    bulk.hidden = false;
    bulk.append(el('span', 'lessons-lib__bulk-count', `${selected.size} selected`));

    const actions: Array<{ label: string; run: () => void | Promise<void> }> = [
      {
        label: 'Archive',
        run: async () => {
          if (!window.confirm(`Archive ${selected.size} lessons?`)) return;
          for (const id of selected) await patchStatus(entityPath('lesson', id), 'archived');
          selected = new Set();
          await options.onMutated?.();
        }
      },
      {
        label: 'Trash',
        run: async () => {
          if (!window.confirm(`Move ${selected.size} lessons to trash?`)) return;
          for (const id of selected) await patchStatus(entityPath('lesson', id), 'trashed');
          selected = new Set();
          await options.onMutated?.();
        }
      },
      {
        label: 'Mark needs review',
        run: async () => {
          for (const id of selected) await patchLessonLibrary(id, { review_status: 'needs_review' });
          selected = new Set();
          await options.onMutated?.();
        }
      }
    ];
    if (curriculum.units.length > 0) {
      const move = selectControl('Move selected to unit', (unitId) => {
        if (!unitId) return;
        void (async () => {
          for (const id of selected) await patchLessonLibrary(id, { unit_id: unitId });
          selected = new Set();
          await options.onMutated?.();
        })();
      });
      option(move, '', 'Move to unit…', true);
      for (const unit of curriculum.units) option(move, unit.id, unit.title, false);
      bulk.append(move);
    }
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'lessons-lib__tag-input';
    tagInput.placeholder = 'Add tag…';
    tagInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const tag = tagInput.value.trim();
      if (!tag) return;
      void (async () => {
        for (const id of selected) {
          const row = curriculum.lessons.find((lesson) => lesson.id === id);
          const tags = [...new Set([...(row?.tags ?? []), tag])];
          await patchLessonLibrary(id, { tags });
        }
        selected = new Set();
        await options.onMutated?.();
      })();
    });
    bulk.append(tagInput);
    for (const action of actions) {
      const btn = el('button', 'btn btn--ghost', action.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        void Promise.resolve(action.run()).catch(() => window.alert('Bulk action failed.'));
      });
      bulk.append(btn);
    }
  }

  function openPreview(row: LessonLibraryRow): void {
    side.hidden = false;
    side.replaceChildren(el('p', 'lessons-lib__side-status', 'Loading preview…'));
    void getLesson(row.id)
      .then((lesson) => {
        paintPreview(row, lesson);
      })
      .catch(() => {
        side.replaceChildren(el('p', 'lessons-lib__side-status', 'Unable to load preview.'));
      });
  }

  function paintPreview(row: LessonLibraryRow, lesson: Lesson): void {
    side.replaceChildren();
    const close = el('button', 'btn btn--ghost', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => {
      side.hidden = true;
      side.replaceChildren();
    });
    side.append(el('h2', 'lessons-lib__side-title', lesson.title), close);
    const badge = lessonBadge(row);
    const pill = el('span', `status-badge status-badge--${badge}`, badgeLabel(badge));
    side.append(pill);
    if (row.excerpt) side.append(el('p', 'lessons-lib__excerpt', row.excerpt));
    const similar = findNearDuplicates([row, ...curriculum.lessons.filter((item) => item.id !== row.id)])
      .filter((pair) => pair.ids.includes(row.id))
      .slice(0, 4);
    if (similar.length > 0) {
      side.append(el('p', 'lessons-lib__side-label', 'Similar lessons'));
      for (const pair of similar) {
        const otherId = pair.ids[0] === row.id ? pair.ids[1] : pair.ids[0];
        const other = curriculum.lessons.find((item) => item.id === otherId);
        if (other) side.append(el('p', 'lessons-lib__similar', other.title));
      }
    }
    const flags = lessonHealthFlags(row, now, extraSets().recentIds);
    if (flags.length > 0) {
      side.append(
        el('p', 'lessons-lib__health', flags.map(healthFlagLabel).join(' · '))
      );
    }
    const historyHost = el('div', 'lessons-lib__history');
    side.append(historyHost);
    const history = mountHistoryPanel({
      kind: 'lesson',
      parentId: row.id,
      host: historyHost,
      onRestored: () => {
        void options.onMutated?.();
      }
    });
    disposers.push(() => history.dispose());
  }

  function renderCard(row: LessonLibraryRow, compact: boolean): HTMLElement {
    const item = el('li', compact ? 'lesson-list__item lesson-list__item--compact' : 'lesson-list__item');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'lessons-lib__check';
    check.checked = selected.has(row.id);
    check.setAttribute('aria-label', `Select ${row.title}`);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(row.id);
      else selected.delete(row.id);
      paintBulk(query().rows);
    });

    const pin = el('button', 'lessons-lib__pin', pins.has(row.id) ? '★' : '☆');
    pin.type = 'button';
    pin.setAttribute('aria-label', pins.has(row.id) ? 'Unpin lesson' : 'Pin lesson');
    pin.addEventListener('click', () => {
      pins = togglePinned(row.id);
      paint();
    });

    const info = el('div', 'lesson-list__info');
    info.append(el('p', 'lesson-list__title', row.title));
    const unit = curriculum.units.find((entry) => entry.id === row.unit_id);
    const badge = lessonBadge(row);
    const meta = el('p', 'lesson-list__meta');
    const pill = el('span', `status-badge status-badge--${badge}`, badgeLabel(badge));
    meta.append(
      document.createTextNode(unit?.title ?? row.unit_id),
      document.createTextNode(' · '),
      pill,
      document.createTextNode(` · ${formatRelativeTime(row.updated_at, now)}`)
    );
    info.append(meta);
    if (row.tags && row.tags.length > 0) {
      const tagRow = el('p', 'lessons-lib__tags');
      for (const tag of row.tags) tagRow.append(el('span', 'lessons-lib__tag', tag));
      info.append(tagRow);
    }

    const actions = el('div', 'list-row-actions');
    const open = el('a', 'btn btn--secondary lesson-list__open', 'Open') as HTMLAnchorElement;
    open.href = `/lessons/${row.id}`;
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(`/lessons/${row.id}`);
    });
    const peek = el('button', 'btn btn--ghost', 'Preview');
    peek.type = 'button';
    peek.addEventListener('click', () => openPreview(row));
    const dup = el('button', 'btn btn--ghost', 'Duplicate');
    dup.type = 'button';
    dup.addEventListener('click', () => {
      void duplicateLesson(row.id)
        .then(() => options.onMutated?.())
        .catch(() => window.alert('Unable to duplicate lesson.'));
    });
    const archive = el('button', 'btn btn--ghost', 'Archive');
    archive.type = 'button';
    archive.addEventListener('click', () => {
      void (async () => {
        try {
          const ok = await confirmAndArchive(entityPath('lesson', row.id), row.title);
          if (ok) await options.onMutated?.();
        } catch {
          window.alert('Unable to archive lesson.');
        }
      })();
    });
    const trash = el('button', 'btn btn--ghost', 'Trash');
    trash.type = 'button';
    trash.addEventListener('click', () => {
      void (async () => {
        try {
          const ok = await confirmAndTrash('lesson', row.id, row.title);
          if (ok) await options.onMutated?.();
        } catch {
          window.alert('Unable to move lesson to trash.');
        }
      })();
    });
    actions.append(open, peek, dup, archive, trash);
    item.append(check, pin, info, actions);
    return item;
  }

  function renderEmpty(): HTMLElement {
    const empty = el('div', 'lessons-lib__empty');
    empty.dataset.lessonsEmpty = '';
    const filtered = countActiveFilters(state) > 0;
    empty.append(
      el('p', 'teacher-layout__canvas-status', filtered ? 'No lessons match these filters.' : 'No lessons yet.')
    );
    if (filtered) {
      const clear = el('button', 'btn btn--secondary', 'Clear filters');
      clear.type = 'button';
      clear.dataset.lessonsClearFilters = '';
      clear.addEventListener('click', () => {
        search.value = '';
        bodyMatchIds = new Set();
        patchState({
          ...DEFAULT_LESSONS_STATE,
          view: state.view,
          density: state.density
        });
      });
      empty.append(clear);
    }
    return empty;
  }

  function paintLibrary(rows: LessonLibraryRow[]): void {
    const pinnedRows = rows.filter((row) => pins.has(row.id));
    const rest = rows.filter((row) => !pins.has(row.id));
    const wrap = el('div', 'lessons-lib__groups');

    if (pinnedRows.length > 0) {
      wrap.append(el('h2', 'lessons-lib__group-title', `Pinned · ${pinnedRows.length}`));
      const list = el('ul', 'lesson-list');
      for (const row of pinnedRows) list.append(renderCard(row, state.density === 'compact'));
      wrap.append(list);
    }

    const groups = groupLessonsByUnit(rest, curriculum.units);
    if (collapsed.size === 0 && groups.length > 6) {
      const keep = new Set(groups.slice(0, 2).map((group) => group.unitId));
      collapsed = new Set(groups.filter((group) => !keep.has(group.unitId)).map((group) => group.unitId));
      writeCollapsedUnits(collapsed);
    }

    for (const group of groups) {
      const details = document.createElement('details');
      details.className = 'lesson-group';
      details.open = !collapsed.has(group.unitId);
      details.addEventListener('toggle', () => {
        if (details.open) collapsed.delete(group.unitId);
        else collapsed.add(group.unitId);
        writeCollapsedUnits(collapsed);
      });
      const summary = document.createElement('summary');
      summary.className = 'lesson-group__summary';
      const extra: string[] = [];
      if (group.needsReview) extra.push(`${group.needsReview} needs review`);
      if (group.archived) extra.push(`${group.archived} archived`);
      summary.textContent = `${group.unitTitle} · ${group.lessons.length} lessons · ${group.published} published, ${group.draft} draft${extra.length ? ` · ${extra.join(', ')}` : ''}`;
      details.append(summary);
      const list = el('ul', 'lesson-list');
      for (const row of group.lessons) list.append(renderCard(row, state.density === 'compact'));
      details.append(list);
      wrap.append(details);
    }
    listHost.append(wrap);
  }

  function paintTable(rows: LessonLibraryRow[]): void {
    const table = document.createElement('table');
    table.className = 'lessons-table';
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of ['', 'Title', 'Unit', 'Status', 'Last edited', 'Created', 'Tags']) {
      hr.append(el('th', undefined, label));
    }
    head.append(hr);
    table.append(head);
    const body = document.createElement('tbody');
    const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit.title]));
    const virtualHost = el('div', 'lessons-table__scroll');
    listHost.append(virtualHost);

    const renderRow = (index: number): HTMLElement => {
      const row = rows[index]!;
      const tr = document.createElement('tr');
      const checkCell = document.createElement('td');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(row.id);
      check.addEventListener('change', () => {
        if (check.checked) selected.add(row.id);
        else selected.delete(row.id);
        paintBulk(rows);
      });
      checkCell.append(check);
      const title = document.createElement('td');
      const link = el('a', 'lessons-table__title', row.title) as HTMLAnchorElement;
      link.href = `/lessons/${row.id}`;
      link.classList.add('lesson-list__open');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(`/lessons/${row.id}`);
      });
      title.append(link);
      const badge = lessonBadge(row);
      const status = document.createElement('td');
      status.append(el('span', `status-badge status-badge--${badge}`, badgeLabel(badge)));
      tr.append(
        checkCell,
        title,
        el('td', undefined, unitsById.get(row.unit_id) ?? row.unit_id),
        status,
        el('td', undefined, formatRelativeTime(row.updated_at, now)),
        el('td', undefined, row.created_at ? formatRelativeTime(row.created_at, now) : '—'),
        el('td', undefined, (row.tags ?? []).join(', '))
      );
      return tr;
    };

    if (rows.length <= 80) {
      for (let i = 0; i < rows.length; i += 1) body.append(renderRow(i));
      table.append(body);
      virtualHost.append(table);
      return;
    }

    table.append(body);
    virtualHost.append(table);
    const virtual = mountVirtualList({
      host: virtualHost,
      itemCount: () => rows.length,
      itemHeight: 44,
      renderRow: (index) => {
        const tr = renderRow(index);
        const wrap = el('div');
        wrap.append(tr);
        return wrap;
      }
    });
    disposers.push(virtual.dispose);
  }

  function paintMap(): void {
    const tree = el('div', 'lessons-map');
    for (const year of curriculum.years) {
      const yearNode = el('details', 'lessons-map__node');
      yearNode.open = true;
      yearNode.append(el('summary', undefined, year.title));
      const subjects = curriculum.subjects.filter((subject) => subject.year_id === year.id);
      for (const subject of subjects) {
        const subjectNode = el('details', 'lessons-map__node');
        subjectNode.open = true;
        subjectNode.append(el('summary', undefined, subject.title));
        const units = curriculum.units.filter((unit) => unit.subject_id === subject.id);
        for (const unit of units) {
          const unitNode = el('details', 'lessons-map__node');
          unitNode.open = false;
          const unitLessons = curriculum.lessons.filter(
            (lesson) => lesson.unit_id === unit.id && lesson.status === 'active'
          );
          unitNode.append(
            el('summary', undefined, `${unit.title} (${unitLessons.length})`)
          );
          const list = el('ul', 'lessons-map__lessons');
          for (const lesson of unitLessons) {
            const item = el('li');
            const link = el('a', 'lesson-list__open', lesson.title) as HTMLAnchorElement;
            link.href = `/lessons/${lesson.id}`;
            link.addEventListener('click', (event) => {
              event.preventDefault();
              navigate(`/lessons/${lesson.id}`);
            });
            item.append(link);
            list.append(item);
          }
          unitNode.append(list);
          subjectNode.append(unitNode);
        }
        yearNode.append(subjectNode);
      }
      tree.append(yearNode);
    }
    if (curriculum.years.length === 0) {
      tree.append(el('p', 'teacher-layout__canvas-status', 'No curriculum tree yet.'));
    }
    listHost.append(tree);
  }

  function paintMine(rows: LessonLibraryRow[]): void {
    const panel = el('div', 'lessons-mine');
    const saved = readSavedViews();
    panel.append(el('h2', 'lessons-lib__group-title', 'Saved views'));
    const saveBtn = el('button', 'btn btn--secondary', 'Save current filters');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      const name = window.prompt('Name this view');
      if (!name?.trim()) return;
      const view: SavedLessonView = {
        id: `view_${Date.now().toString(36)}`,
        name: name.trim(),
        state: {
          q: state.q,
          units: state.units,
          statuses: state.statuses,
          tags: state.tags,
          authors: state.authors,
          outcomes: state.outcomes,
          sort: state.sort,
          view: 'library',
          density: state.density,
          smart: state.smart
        }
      };
      writeSavedViews([...saved, view]);
      paint();
    });
    panel.append(saveBtn);
    for (const view of saved) {
      const row = el('div', 'lessons-mine__saved');
      const open = el('button', 'btn btn--ghost', view.name);
      open.type = 'button';
      open.addEventListener('click', () => {
        patchState({ ...view.state, savedViewId: view.id });
      });
      const remove = el('button', 'btn btn--ghost', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        writeSavedViews(readSavedViews().filter((entry) => entry.id !== view.id));
        paint();
      });
      row.append(open, remove);
      panel.append(row);
    }

    const extras = extraSets();
    panel.append(el('h2', 'lessons-lib__group-title', 'Today on the timetable'));
    const todayRows = curriculum.lessons.filter((lesson) => extras.todayIds.has(lesson.id));
    if (todayRows.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Nothing scheduled for today.'));
    } else {
      const list = el('ul', 'lesson-list');
      for (const row of todayRows) list.append(renderCard(row, true));
      panel.append(list);
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Needs attention'));
    const healthRows = rows.filter((row) => extras.healthIds.has(row.id)).slice(0, 12);
    if (healthRows.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Library looks healthy.'));
    } else {
      const list = el('ul', 'lesson-list');
      for (const row of healthRows) list.append(renderCard(row, true));
      panel.append(list);
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Possible duplicates'));
    const pairs = findNearDuplicates(curriculum.lessons).slice(0, 8);
    if (pairs.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'No near-duplicates detected.'));
    } else {
      for (const pair of pairs) {
        panel.append(
          el(
            'p',
            'lessons-lib__similar',
            `${pair.titles[0]} ↔ ${pair.titles[1]} (${Math.round(pair.score * 100)}%)`
          )
        );
      }
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Syllabus gaps (HSC English Advanced)'));
    const gaps = coverageGaps(curriculum.lessons);
    if (gaps.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Every listed outcome has at least one tagged lesson.'));
    } else {
      for (const gap of gaps) {
        panel.append(el('p', 'lessons-lib__gap', `${gap.id} · ${gap.module} — ${gap.label}`));
      }
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Export unit pack'));
    const exportSelect = selectControl('Export unit', (unitId) => {
      if (!unitId) return;
      void exportUnitPack(curriculum, unitId);
    });
    option(exportSelect, '', 'Choose a unit…', true);
    for (const unit of curriculum.units) option(exportSelect, unit.id, unit.title, false);
    panel.append(exportSelect);

    const authors = uniqueAuthors(curriculum.lessons);
    if (authors.length > 0) {
      panel.append(el('h2', 'lessons-lib__group-title', 'Filter by author'));
      for (const author of authors) {
        const btn = el('button', 'btn btn--ghost', author.name);
        btn.type = 'button';
        btn.addEventListener('click', () => patchState({ authors: [author.id], view: 'library' }));
        panel.append(btn);
      }
    }

    const outcomeWrap = el('div', 'lessons-lib__outcomes');
    outcomeWrap.append(el('h2', 'lessons-lib__group-title', 'Filter by outcome'));
    for (const outcome of HSC_ENGLISH_ADVANCED_OUTCOMES) {
      const btn = el('button', 'lessons-lib__tag', outcome.id);
      btn.type = 'button';
      btn.title = outcome.label;
      btn.addEventListener('click', () => patchState({ outcomes: [outcome.id], view: 'library' }));
      outcomeWrap.append(btn);
    }
    panel.append(outcomeWrap);

    listHost.append(panel);
  }

  function paintList(): void {
    const result = query();
    countEl.textContent = formatLessonCount(result.totalInLibrary, result.shown, result.filtered);
    listHost.replaceChildren();
    paintBulk(result.rows);
    if (state.view === 'map') {
      paintMap();
      return;
    }
    if (state.view === 'mine') {
      paintMine(result.rows);
      return;
    }
    if (result.rows.length === 0) {
      listHost.append(renderEmpty());
      return;
    }
    if (state.view === 'table') paintTable(result.rows);
    else paintLibrary(result.rows);
  }

  function paint(): void {
    fillSelects();
    paintViews();
    paintRail();
    paintList();
    const filterCount = countActiveFilters(state);
    filters.dataset.activeCount = String(filterCount);
  }

  paint();
  if (state.q.trim().length >= 2) void refreshBodyMatches(state.q);

  return {
    dispose: () => {
      if (searchTimer !== null) window.clearTimeout(searchTimer);
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

export async function promptLessonFromTemplate(curriculum: CurriculumResponse): Promise<string | null> {
  const units = curriculum.units.filter((unit) => unit.status === 'active');
  if (units.length === 0) {
    window.alert('Create a unit before using a lesson template.');
    return null;
  }
  try {
    const { templates } = await listLessonTemplates();
    if (templates.length === 0) {
      window.alert('No lesson templates yet. Save one from a lesson editor.');
      return null;
    }
    const names = templates.map((row, index) => `${index + 1}. ${row.title}`).join('\n');
    const pick = window.prompt(`New lesson from template:\n${names}\n\nEnter a number`);
    const index = Number(pick) - 1;
    const template = templates[index];
    if (!template) return null;
    const unitPick = window.prompt(
      `Unit for “${template.title}”:\n${units.map((unit, i) => `${i + 1}. ${unit.title}`).join('\n')}`
    );
    const unit = units[Number(unitPick) - 1];
    if (!unit) return null;
    const created = await useLessonTemplate({ templateId: template.id, unitId: unit.id });
    return created.id;
  } catch {
    window.alert('Unable to create from template.');
    return null;
  }
}
