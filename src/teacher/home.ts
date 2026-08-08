import { navigate } from '@/app/router';
import type { Class, ScheduledLesson } from '@/schemas';
import type { CurriculumLessonSummary, CurriculumResponse } from './nav';
import {
  groupWeekSchedule,
  selectRecentlyEdited,
  selectTodaySchedule,
  selectUnpublishedChanges
} from './home-model';

/**
 * Teacher Home dashboard: Today → This week → Unpublished | Recently edited.
 * Full lesson list lives on the Lessons section only.
 */
export function renderTeacherHome(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  canvas.replaceChildren();

  const lessonsById = new Map(curriculum.lessons.map((lesson) => [lesson.id, lesson]));
  const classesById = new Map(curriculum.classes.map((cls) => [cls.id, cls]));
  const anchorDate = curriculum.schedule_anchor_date;
  const todayEntries = selectTodaySchedule(curriculum.scheduled_lessons, anchorDate);
  const weekDays = groupWeekSchedule(curriculum.scheduled_lessons, anchorDate);
  const unpublished = selectUnpublishedChanges(curriculum.lessons);
  const recentlyEdited = selectRecentlyEdited(curriculum.lessons);

  const root = document.createElement('div');
  root.className = 'home-dashboard';

  root.append(
    buildTodayPanel(todayEntries, lessonsById, classesById, anchorDate),
    buildWeekPanel(weekDays, lessonsById, classesById),
    buildAttentionGrid(unpublished, recentlyEdited)
  );

  canvas.append(root);
}

function buildTodayPanel(
  entries: ScheduledLesson[],
  lessonsById: Map<string, CurriculumLessonSummary>,
  classesById: Map<string, Class>,
  anchorDate: string
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__panel';
  panel.dataset.homePanel = 'today';

  const heading = document.createElement('h2');
  heading.className = 'home-dashboard__heading';
  heading.textContent = `Today · ${anchorDate}`;
  panel.append(heading);

  if (entries.length === 0) {
    panel.append(emptyCopy('Nothing scheduled for today.'));
    return panel;
  }

  panel.append(buildScheduleList(entries, lessonsById, classesById));
  return panel;
}

function buildWeekPanel(
  weekDays: { date: string; entries: ScheduledLesson[] }[],
  lessonsById: Map<string, CurriculumLessonSummary>,
  classesById: Map<string, Class>
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__panel';
  panel.dataset.homePanel = 'week';

  const heading = document.createElement('h2');
  heading.className = 'home-dashboard__heading';
  heading.textContent = 'This week';
  panel.append(heading);

  if (weekDays.length === 0) {
    panel.append(emptyCopy('Nothing scheduled this week.'));
    return panel;
  }

  for (const day of weekDays) {
    const dayBlock = document.createElement('div');
    dayBlock.className = 'home-schedule__day';

    const dayHeading = document.createElement('h3');
    dayHeading.className = 'home-schedule__day-heading';
    dayHeading.textContent = formatWeekdayDate(day.date);
    dayBlock.append(dayHeading, buildScheduleList(day.entries, lessonsById, classesById));
    panel.append(dayBlock);
  }

  return panel;
}

function buildAttentionGrid(
  unpublished: CurriculumLessonSummary[],
  recentlyEdited: CurriculumLessonSummary[]
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'home-dashboard__attention';

  grid.append(
    buildAttentionPanel('unpublished', 'Unpublished changes', unpublished),
    buildAttentionPanel('recent', 'Recently edited', recentlyEdited)
  );

  return grid;
}

function buildAttentionPanel(
  panelKey: 'unpublished' | 'recent',
  title: string,
  lessons: CurriculumLessonSummary[]
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'home-dashboard__panel';
  panel.dataset.homePanel = panelKey;

  const heading = document.createElement('h2');
  heading.className = 'home-dashboard__heading';
  heading.textContent = title;
  panel.append(heading);

  if (lessons.length === 0) {
    panel.append(emptyCopy('None right now.'));
    return panel;
  }

  const list = document.createElement('ul');
  list.className = 'home-attention';

  for (const lesson of lessons) {
    const item = document.createElement('li');
    item.className = 'home-attention__item';

    const titleEl = document.createElement('p');
    titleEl.className = 'home-attention__title';
    titleEl.textContent = lesson.title;

    item.append(titleEl, openLink(lesson.id, 'home-attention__open'));
    list.append(item);
  }

  panel.append(list);
  return panel;
}

function buildScheduleList(
  entries: ScheduledLesson[],
  lessonsById: Map<string, CurriculumLessonSummary>,
  classesById: Map<string, Class>
): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'home-schedule';

  for (const entry of entries) {
    const lesson = lessonsById.get(entry.lesson_id);
    const cls = classesById.get(entry.class_id);
    const item = document.createElement('li');
    item.className = 'home-schedule__item';

    const info = document.createElement('div');
    info.className = 'home-schedule__info';

    const meta = document.createElement('p');
    meta.className = 'home-schedule__meta';
    const classLabel = cls?.code ?? cls?.title ?? entry.class_id;
    const lessonTitle = lesson?.title ?? entry.lesson_id;
    const publishState = lesson?.published ? 'Published' : 'Draft';
    meta.textContent = `${classLabel} · ${lessonTitle} · ${publishState}`;

    info.append(meta);
    item.append(info, openLink(entry.lesson_id, 'home-schedule__open'));
    list.append(item);
  }

  return list;
}

function openLink(lessonId: string, className: string): HTMLAnchorElement {
  const path = `/lessons/${lessonId}`;
  const open = document.createElement('a');
  open.className = `btn btn--secondary ${className}`;
  open.href = path;
  open.textContent = 'Open';
  open.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });
  return open;
}

function emptyCopy(text: string): HTMLParagraphElement {
  const empty = document.createElement('p');
  empty.className = 'home-dashboard__empty';
  empty.textContent = text;
  return empty;
}

/** Human-readable weekday + date from YYYY-MM-DD using UTC. */
function formatWeekdayDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}
