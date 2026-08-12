import type { CalendarDayLesson, ClassCalendarModel } from '@/schedule/class-calendar-model';

export interface RenderClassCalendarOptions {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  monthDelta?: number;
  unitTitles?: Map<string, string>;
  /** SPA navigation for lesson links; when set, anchors preventDefault then call this. */
  onNavigate?: (path: string) => void;
}

type CalendarHandlers = {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  onNavigate?: (path: string) => void;
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
    onNavigate
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

    nav.append(prev, label, next);

    const grid = document.createElement('div');
    grid.className = 'class-calendar__grid';
    grid.setAttribute('role', 'grid');

    const detail = document.createElement('div');
    detail.className = 'class-calendar__detail';

    root.append(nav, grid, detail);
    host.replaceChildren(root);
  }

  handlersByRoot.set(root, { onSelectDate, onShiftMonth, onNavigate });

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
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => handlersByRoot.get(root)?.onShiftMonth(-1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => handlersByRoot.get(root)?.onShiftMonth(1));
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
  const singleLesson = day.lessons.length === 1 ? day.lessons[0] : null;
  const cell = singleLesson
    ? Object.assign(document.createElement('a'), {
        href: `/lessons/${singleLesson.lessonId}`
      })
    : Object.assign(document.createElement('button'), { type: 'button' as const });

  cell.className = 'class-calendar__day';
  cell.dataset.date = day.date;
  if (!day.inMonth) cell.dataset.outside = 'true';
  if (day.isToday) {
    cell.dataset.today = 'true';
    cell.setAttribute('aria-current', 'date');
  }
  if (day.isSelected) cell.dataset.selected = 'true';
  cell.setAttribute('aria-label', accessibleDayLabel(day.date, day.lessons));

  if (singleLesson) {
    wireSpaLink(cell as HTMLAnchorElement, root);
  } else {
    cell.addEventListener('click', () => handlersByRoot.get(root)?.onSelectDate(day.date));
  }

  const num = document.createElement('span');
  num.className = 'class-calendar__day-num';
  num.textContent = String(day.day);
  cell.append(num, buildDots(day.lessons));
  return cell;
}

function buildDots(lessons: CalendarDayLesson[]): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'calendar-dots';
  for (const lesson of lessons.slice(0, 4)) {
    const dot = document.createElement('i');
    dot.className = `calendar-dot ${lesson.status}`;
    dot.title = lesson.title;
    wrap.append(dot);
  }
  return wrap;
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
