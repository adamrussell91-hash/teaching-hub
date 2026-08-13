import { pastelFromId } from '@/design/pastel';
import type { CalendarDayLesson, ClassCalendarModel } from '@/schedule/class-calendar-model';

export interface RenderClassCalendarOptions {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  monthDelta?: number;
  unitTitles?: Map<string, string>;
  /** SPA navigation for lesson links; when set, anchors preventDefault then call this. */
  onNavigate?: (path: string) => void;
  /** Empty-day CTA — opens schedule flow when provided. */
  onScheduleLesson?: () => void;
}

type CalendarHandlers = {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  onNavigate?: (path: string) => void;
  onScheduleLesson?: () => void;
  today: string;
};

const handlersByRoot = new WeakMap<HTMLElement, CalendarHandlers>();

/**
 * Month calendar + selected-day detail. Replaces the class page "This week" strip.
 * Nav buttons bind once via dataset.bound; callbacks stay fresh via WeakMap.
 * Grid and detail rebuild each render.
 */
export function renderClassCalendar(
  host: HTMLElement,
  model: ClassCalendarModel,
  {
    onSelectDate,
    onShiftMonth,
    monthDelta = 0,
    unitTitles,
    onNavigate,
    onScheduleLesson
  }: RenderClassCalendarOptions
): void {
  let root = host.querySelector<HTMLElement>(':scope > .class-calendar');
  if (!root) {
    root = document.createElement('div');
    root.className = 'class-calendar';

    const nav = document.createElement('div');
    nav.className = 'class-calendar__nav';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'class-calendar__nav-btn';
    prev.setAttribute('aria-label', 'Previous month');
    prev.dataset.calendar = 'prev-month';
    prev.textContent = '‹';

    const label = document.createElement('span');
    label.className = 'class-calendar__month-label';
    label.dataset.calendar = 'month-label';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'class-calendar__nav-btn';
    next.setAttribute('aria-label', 'Next month');
    next.dataset.calendar = 'next-month';
    next.textContent = '›';

    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'class-calendar__today';
    todayBtn.dataset.calendar = 'today';
    todayBtn.textContent = 'Today';

    nav.append(prev, label, next, todayBtn);

    const grid = document.createElement('div');
    grid.className = 'class-calendar__grid';
    grid.setAttribute('role', 'grid');

    const detail = document.createElement('div');
    detail.className = 'class-calendar__detail';

    root.append(nav, grid, detail);
    host.replaceChildren(root);
  }

  handlersByRoot.set(root, {
    onSelectDate,
    onShiftMonth,
    onNavigate,
    onScheduleLesson,
    today: model.today
  });

  const label = root.querySelector<HTMLElement>('[data-calendar="month-label"]');
  if (label) label.textContent = model.monthLabel;

  const grid = root.querySelector<HTMLElement>('.class-calendar__grid');
  if (grid) {
    grid.replaceChildren();
    for (const heading of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      const cell = document.createElement('span');
      cell.className = 'class-calendar__weekday';
      cell.textContent = heading;
      grid.append(cell);
    }
    for (const day of model.monthDays) {
      grid.append(buildDayCell(day, root));
    }
    applyMonthMotion(grid, monthDelta);
  }

  const detail = root.querySelector<HTMLElement>('.class-calendar__detail');
  if (detail) {
    detail.replaceChildren();
    renderDayDetail(detail, model, unitTitles, root);
  }

  const prev = root.querySelector<HTMLButtonElement>('[data-calendar="prev-month"]');
  const next = root.querySelector<HTMLButtonElement>('[data-calendar="next-month"]');
  const todayBtn = root.querySelector<HTMLButtonElement>('[data-calendar="today"]');
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => handlersByRoot.get(root)?.onShiftMonth(-1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => handlersByRoot.get(root)?.onShiftMonth(1));
  }
  if (todayBtn && !todayBtn.dataset.bound) {
    todayBtn.dataset.bound = '1';
    todayBtn.addEventListener('click', () => {
      const handlers = handlersByRoot.get(root);
      if (!handlers) return;
      handlers.onSelectDate(handlers.today);
    });
  }
}

function applyMonthMotion(grid: HTMLElement, monthDelta: number): void {
  delete grid.dataset.motion;
  if (!monthDelta) return;
  void grid.offsetWidth;
  grid.dataset.motion = monthDelta > 0 ? 'forward' : 'back';
}

function wireSpaLink(anchor: HTMLAnchorElement, root: HTMLElement): void {
  anchor.addEventListener('click', (event) => {
    event.stopPropagation();
    const navigate = handlersByRoot.get(root)?.onNavigate;
    if (!navigate) return;
    event.preventDefault();
    navigate(anchor.getAttribute('href') ?? '/');
  });
}

function buildDayCell(
  day: ClassCalendarModel['monthDays'][number],
  root: HTMLElement
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'class-calendar__day';
  cell.setAttribute('role', 'gridcell');
  cell.tabIndex = 0;
  cell.dataset.date = day.date;
  if (!day.inMonth) cell.dataset.outside = 'true';
  if (day.isToday) {
    cell.dataset.today = 'true';
    cell.setAttribute('aria-current', 'date');
  }
  if (day.isSelected) cell.dataset.selected = 'true';
  cell.setAttribute('aria-label', accessibleDayLabel(day.date, day.lessons));
  const selectDay = (): void => {
    handlersByRoot.get(root)?.onSelectDate(day.date);
  };
  cell.addEventListener('click', selectDay);
  cell.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectDay();
  });

  const num = document.createElement('span');
  num.className = 'class-calendar__day-num';
  num.textContent = String(day.day);
  cell.append(num);

  const visible = day.lessons.slice(0, 2);
  for (const lesson of visible) {
    const chip = document.createElement('a');
    chip.className = 'event-chip';
    chip.href = `/lessons/${lesson.lessonId}`;
    chip.dataset.tint = pastelFromId(lesson.unitId);
    chip.textContent = lesson.title;
    wireSpaLink(chip, root);
    cell.append(chip);
  }

  const overflow = day.lessons.length - visible.length;
  if (overflow > 0) {
    const more = document.createElement('span');
    more.className = 'event-chip-more';
    more.textContent = `+${overflow} more`;
    cell.append(more);
  }

  return cell;
}

function renderDayDetail(
  detail: HTMLElement,
  model: ClassCalendarModel,
  unitTitles: Map<string, string> | undefined,
  root: HTMLElement
): void {
  const heading = document.createElement('h3');
  heading.className = 'class-calendar__detail-heading';
  heading.textContent = formatDetailHeading(model.selectedDate);
  detail.append(heading);

  if (model.dayLessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'class-calendar__detail-empty';
    empty.textContent = 'No lessons scheduled this day.';
    detail.append(empty);

    const scheduleBtn = document.createElement('button');
    scheduleBtn.type = 'button';
    scheduleBtn.className = 'class-calendar__schedule-btn';
    scheduleBtn.textContent = 'Schedule a lesson';
    scheduleBtn.addEventListener('click', () => {
      handlersByRoot.get(root)?.onScheduleLesson?.();
    });
    detail.append(scheduleBtn);
    return;
  }

  const list = document.createElement('div');
  list.className = 'class-calendar__detail-list';

  for (const lesson of model.dayLessons) {
    const row = document.createElement('a');
    row.className = 'class-calendar__detail-lesson';
    row.href = `/lessons/${lesson.lessonId}`;
    wireSpaLink(row, root);

    const title = document.createElement('span');
    title.className = 'class-calendar__detail-title';
    title.textContent = lesson.title;

    const meta = document.createElement('span');
    meta.className = 'class-calendar__detail-meta';
    const unitName = unitTitles?.get(lesson.unitId);
    meta.textContent = [unitName, lesson.status].filter(Boolean).join(' · ');

    row.append(title, meta);
    list.append(row);
  }

  detail.append(list);
}

function parseDateKey(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function accessibleDayLabel(date: string, lessons: CalendarDayLesson[]): string {
  const monthDay = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(parseDateKey(date));
  if (lessons.length === 0) return monthDay;
  return `${monthDay}, ${lessons.map((lesson) => lesson.title).join(', ')}`;
}

function formatDetailHeading(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(parseDateKey(date));
}
