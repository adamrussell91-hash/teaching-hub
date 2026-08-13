import { navigate } from '@/app/router';
import { pastelFromId } from '@/design/pastel';
import type { Class, ScheduledLesson } from '@/schemas';
import { resolveScheduleToday } from '@/schedule/today';
import { mountCreateControl } from '@/teacher/create/control';
import { openCreateModal } from '@/teacher/create/modal';
import type { CreateKind } from '@/teacher/create/types';
import { mountHomeClock } from '@/teacher/home-clock';
import { renderPageHeader } from '@/teacher/page-header';
import type { CurriculumLessonSummary, CurriculumResponse } from './nav';
import {
  selectTodaySchedule,
  selectUnpublishedChanges
} from './home-model';

export interface TeacherHomeOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
}

/**
 * Cotton Glass Home: page header + clock, signal tiles, today card, week chips, class tiles.
 */
export function renderTeacherHome(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: TeacherHomeOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const lessonsById = new Map(curriculum.lessons.map((lesson) => [lesson.id, lesson]));
  const classesById = new Map(curriculum.classes.map((cls) => [cls.id, cls]));
  const scheduleToday = resolveScheduleToday(curriculum.schedule_anchor_date);
  const todayEntries = selectTodaySchedule(curriculum.scheduled_lessons, scheduleToday);
  const unpublished = selectUnpublishedChanges(curriculum.lessons);

  let weekOffset = 0;
  const disposers: Array<() => void> = [];

  const root = document.createElement('div');
  root.className = 'home-dashboard';

  const createHost = document.createElement('div');
  createHost.className = 'home-dashboard__create create-control';
  createHost.dataset.createHost = '';

  const openHomeCreate = (): void => {
    createHost.querySelector<HTMLButtonElement>('[data-create-trigger]')?.click();
  };

  const hero = document.createElement('div');
  hero.className = 'home-dashboard__hero';

  renderPageHeader(hero, {
    eyebrow: 'Workspace',
    title: 'Teaching Dashboard',
    supporting: 'Today’s classes and what still needs publishing.',
    actions: [createHost]
  });

  const clockHost = document.createElement('div');
  clockHost.className = 'home-dashboard__clock';
  disposers.push(mountHomeClock(clockHost));
  hero.querySelector('.page-header__copy')?.prepend(clockHost);

  const createControl = mountCreateControl(createHost, {
    context: 'home',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const weekMount = document.createElement('div');
  weekMount.className = 'home-dashboard__week-mount';

  const renderWeek = (): void => {
    weekMount.replaceChildren(
      buildWeekPanel({
        curriculum,
        lessonsById,
        scheduleToday,
        weekOffset,
        onOffsetChange: (next) => {
          weekOffset = next;
          renderWeek();
        },
        onCreate: openHomeCreate
      })
    );
  };
  renderWeek();

  const openCreateClass = (): void => {
    openCreateModal({
      kind: 'class',
      curriculum,
      onCreated: options.onCreated ?? (() => undefined)
    });
  };

  root.append(
    hero,
    buildSignalsPanel(todayEntries.length, unpublished.length, openHomeCreate),
    buildTodayCard(todayEntries, lessonsById, classesById),
    weekMount,
    buildClassesPanel(
      curriculum.classes.filter((cls) => cls.status === 'active'),
      curriculum,
      openCreateClass
    )
  );

  canvas.append(root);

  return {
    dispose: () => {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    }
  };
}

function buildSignalsPanel(
  todayCount: number,
  unpublishedCount: number,
  onCreate: () => void
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__signals';
  panel.dataset.homePanel = 'signals';

  panel.append(
    buildSignalTile('Today', String(todayCount)),
    buildSignalTile('Unpublished', String(unpublishedCount), {
      emphasize: unpublishedCount > 0
    })
  );

  const createTile = document.createElement('button');
  createTile.type = 'button';
  createTile.className = 'glass-tile home-signal home-signal--create';
  createTile.textContent = '+ Create new';
  createTile.addEventListener('click', onCreate);
  panel.append(createTile);

  return panel;
}

function buildTodayCard(
  todayEntries: ScheduledLesson[],
  lessonsById: Map<string, CurriculumLessonSummary>,
  classesById: Map<string, Class>
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'home-today';

  const heading = document.createElement('h2');
  heading.className = 'home-today__heading';
  heading.textContent = 'Today';
  card.append(heading);

  if (todayEntries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'home-today__empty';
    empty.textContent = 'No lessons scheduled today.';
    card.append(empty);
    return card;
  }

  const list = document.createElement('ul');
  list.className = 'home-today__list';

  for (const entry of todayEntries) {
    const lesson = lessonsById.get(entry.lesson_id);
    const cls = classesById.get(entry.class_id);
    const path = `/lessons/${entry.lesson_id}`;

    const item = document.createElement('li');
    item.className = 'home-today__item';

    const link = document.createElement('a');
    link.className = 'home-today__link';
    link.href = path;
    link.textContent = [lesson?.title ?? entry.lesson_id, cls?.code]
      .filter(Boolean)
      .join(' · ');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(link);
    list.append(item);
  }

  card.append(list);
  return card;
}

function buildSignalTile(
  label: string,
  value: string,
  options: { emphasize?: boolean } = {}
): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'glass-tile home-signal';
  if (options.emphasize) tile.classList.add('home-signal--emphasis');

  const valueEl = document.createElement('p');
  valueEl.className = 'home-signal__value';
  valueEl.textContent = value;

  const labelEl = document.createElement('p');
  labelEl.className = 'home-signal__label';
  labelEl.textContent = label;

  tile.append(valueEl, labelEl);
  return tile;
}

function buildWeekPanel(args: {
  curriculum: CurriculumResponse;
  lessonsById: Map<string, CurriculumLessonSummary>;
  scheduleToday: string;
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
  onCreate: () => void;
}): HTMLElement {
  const {
    curriculum,
    lessonsById,
    scheduleToday,
    weekOffset,
    onOffsetChange,
    onCreate
  } = args;

  const panel = document.createElement('section');
  panel.className = 'glass-tile home-dashboard__week';
  panel.dataset.homePanel = 'week';

  const viewAnchor = addDaysYmd(scheduleToday, weekOffset * 7);
  const monday = startOfWeekMondayYmd(viewAnchor);
  const days = Array.from({ length: 5 }, (_, i) => {
    const date = addDaysYmd(monday, i);
    return {
      date,
      entries: curriculum.scheduled_lessons
        .filter((entry) => entry.date === date)
        .sort((a, b) => a.schedule_order - b.schedule_order)
    };
  });

  const header = document.createElement('div');
  header.className = 'home-week__header';

  const monthLabel = document.createElement('h2');
  monthLabel.className = 'home-week__month';
  monthLabel.textContent = formatMonthLabel(monday);

  const nav = document.createElement('div');
  nav.className = 'home-week__nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--secondary home-week__nav-btn';
  prevBtn.textContent = 'Previous';
  prevBtn.addEventListener('click', () => onOffsetChange(weekOffset - 1));

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'btn btn--secondary home-week__nav-btn';
  todayBtn.textContent = 'Today';
  todayBtn.addEventListener('click', () => onOffsetChange(0));

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--secondary home-week__nav-btn';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => onOffsetChange(weekOffset + 1));

  nav.append(prevBtn, todayBtn, nextBtn);

  const tabs = document.createElement('div');
  tabs.className = 'section-tabs home-week__tabs';
  tabs.setAttribute('role', 'tablist');

  for (const [id, label, selected] of [
    ['week', 'Week', true],
    ['month', 'Month', false],
    ['timeline', 'Timeline', false]
  ] as const) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'section-tabs__tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.homeWeekTab = id;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) tab.classList.add('is-selected');
    tab.textContent = label;
    if (!selected) {
      tab.disabled = true;
      tab.title = 'Coming soon';
    }
    tabs.append(tab);
  }

  header.append(monthLabel, nav, tabs);

  const columns = document.createElement('div');
  columns.className = 'home-week__columns';

  for (const day of days) {
    columns.append(
      buildDayColumn(day, scheduleToday, lessonsById, onCreate)
    );
  }

  panel.append(header, columns);
  return panel;
}

function buildDayColumn(
  day: { date: string; entries: ScheduledLesson[] },
  scheduleToday: string,
  lessonsById: Map<string, CurriculumLessonSummary>,
  onCreate: () => void
): HTMLElement {
  const column = document.createElement('div');
  column.className = 'home-week__day';
  column.dataset.homeWeekDate = day.date;
  if (day.date === scheduleToday) {
    column.classList.add('home-week__day--today');
  }

  const heading = document.createElement('div');
  heading.className = 'home-week__day-heading';

  const weekday = document.createElement('span');
  weekday.className = 'home-week__weekday';
  weekday.textContent = formatWeekdayShort(day.date);

  const dayNum = document.createElement('span');
  dayNum.className = 'home-week__day-number';
  dayNum.textContent = String(dayNumber(day.date));

  heading.append(weekday, dayNum);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'home-week__add';
  addBtn.setAttribute('aria-label', `Create for ${day.date}`);
  addBtn.textContent = '+';
  addBtn.addEventListener('click', onCreate);

  column.append(heading, addBtn);

  if (day.entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'home-week__empty';
    empty.textContent = 'No lessons';
    column.append(empty);
  } else {
    for (const entry of day.entries) {
      column.append(buildLessonCard(entry, lessonsById));
    }
  }

  return column;
}

function buildLessonCard(
  entry: ScheduledLesson,
  lessonsById: Map<string, CurriculumLessonSummary>
): HTMLAnchorElement {
  const lesson = lessonsById.get(entry.lesson_id);
  const path = `/lessons/${entry.lesson_id}`;

  const card = document.createElement('a');
  card.className = 'event-chip';
  card.href = path;
  card.dataset.tint = pastelFromId(entry.unit_id);
  card.dataset.homeLessonId = entry.lesson_id;
  card.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });

  const titleEl = document.createElement('span');
  titleEl.className = 'event-chip__title';
  titleEl.textContent = lesson?.title ?? entry.lesson_id;

  card.append(titleEl);
  return card;
}

function buildClassesPanel(
  classes: Class[],
  curriculum: CurriculumResponse,
  onCreate: () => void
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__classes';
  panel.dataset.homePanel = 'classes';

  const heading = document.createElement('h2');
  heading.className = 'home-dashboard__heading';
  heading.textContent = 'Your classes';
  panel.append(heading);

  const grid = document.createElement('div');
  grid.className = 'home-classes';

  const subjectsById = new Map(curriculum.subjects.map((s) => [s.id, s]));
  const sorted = [...classes].sort((a, b) => a.code.localeCompare(b.code));

  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'home-dashboard__empty';
    empty.textContent = 'No classes yet. Create one to get started.';
    grid.append(empty);
  } else {
    for (const cls of sorted) {
      const path = `/classes/${cls.id}`;
      const tile = document.createElement('a');
      tile.className = 'glass-panel glass-tile home-class-tile';
      tile.href = path;
      tile.dataset.homeClassId = cls.id;
      tile.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(path);
      });

      const eyebrow = document.createElement('p');
      eyebrow.className = 'home-class-tile__eyebrow';
      const subject = subjectsById.get(cls.subject_id);
      eyebrow.textContent = [String(cls.academic_year), subject?.title]
        .filter(Boolean)
        .join(' · ');

      const name = document.createElement('p');
      name.className = 'home-class-tile__title';
      name.textContent = cls.code || cls.title;

      tile.append(eyebrow, name);
      grid.append(tile);
    }
  }

  const newClass = document.createElement('button');
  newClass.type = 'button';
  newClass.className = 'glass-tile home-class-tile home-class-tile--create';
  newClass.textContent = '+ New class';
  newClass.addEventListener('click', onCreate);
  grid.append(newClass);

  panel.append(grid);
  return panel;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function startOfWeekMondayYmd(ymd: string): string {
  const date = parseYmd(ymd);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return formatYmd(date);
}

function dayNumber(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

function formatWeekdayShort(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString('en-AU', {
    weekday: 'short',
    timeZone: 'UTC'
  });
}

function formatMonthLabel(mondayYmd: string): string {
  const monday = parseYmd(mondayYmd);
  const friday = parseYmd(addDaysYmd(mondayYmd, 4));
  if (
    monday.getUTCFullYear() === friday.getUTCFullYear() &&
    monday.getUTCMonth() === friday.getUTCMonth()
  ) {
    return monday.toLocaleDateString('en-AU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }
  const start = monday.toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
  const end = friday.toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
  return `${start} – ${end}`;
}
