import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import type { Class, ScheduledLesson } from '@/schemas';
import { resolveScheduleToday } from '@/schedule/today';
import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import type { CurriculumLessonSummary, CurriculumResponse } from '@/teacher/nav';
import {
  mountHomepageEditor,
  normalizeHomepage,
  renderHomepageRegionsView,
  type HomepageEditorHandle
} from '@/teacher/sections/homepage-editor';
import { patchClass, patchScheduledLesson } from '@/teacher/schedule-api';

export interface ClassesIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
}

export interface ClassPageOptions {
  onScheduleMutated?: () => void | Promise<void>;
  onScheduleUnit?: () => void;
}

export function renderClassesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: ClassesIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const header = document.createElement('header');
  header.className = 'classes-index__header';

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Classes';

  const createHost = document.createElement('div');
  createHost.className = 'classes-index__create create-control';
  createHost.dataset.createHost = '';

  header.append(heading, createHost);

  const createControl = mountCreateControl(createHost, {
    context: 'classes',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const classes = [...curriculum.classes].sort((a, b) => a.code.localeCompare(b.code));

  const grid = document.createElement('div');
  grid.className = 'home-classes classes-index__grid';

  if (classes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No classes yet.';
    grid.append(empty);
  } else {
    for (const cls of classes) {
      const subject = subjectsById.get(cls.subject_id);
      const path = `/classes/${cls.id}`;

      const tile = document.createElement('a');
      tile.className = 'glass-tile home-class-tile';
      tile.href = path;
      tile.dataset.classId = cls.id;
      tile.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(path);
      });

      const eyebrow = document.createElement('p');
      eyebrow.className = 'home-class-tile__eyebrow';
      eyebrow.textContent = [String(cls.academic_year), subject?.title].filter(Boolean).join(' · ');

      const title = document.createElement('p');
      title.className = 'home-class-tile__title';
      title.textContent = cls.code || cls.title;

      tile.append(eyebrow, title);
      grid.append(tile);
    }
  }

  canvas.append(header, grid);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

export function renderClassPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  classId: string,
  options: ClassPageOptions = {}
): void {
  canvas.replaceChildren();

  const cls = curriculum.classes.find((entry) => entry.id === classId);
  if (!cls) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Class not found.';
    canvas.append(status);
    return;
  }

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const lessonsById = new Map(curriculum.lessons.map((lesson) => [lesson.id, lesson]));

  const year = yearsById.get(cls.year_id);
  const subject = subjectsById.get(cls.subject_id);

  const root = document.createElement('div');
  root.className = 'class-page';

  root.append(
    buildHeader(cls, year?.title, subject?.title),
    buildCurrentUnitSection(cls, unitsById),
    buildCurrentLessonSection(cls, curriculum, lessonsById),
    buildScheduleSection(cls, curriculum, lessonsById, options),
    buildUnitsSection(cls, unitsById),
    buildHomepageSection(cls, options)
  );

  canvas.append(root);
}

function buildHeader(cls: Class, yearTitle?: string, subjectTitle?: string): HTMLElement {
  const section = document.createElement('header');
  section.className = 'class-page__header';
  section.dataset.classSection = 'header';

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = cls.code;

  const title = document.createElement('p');
  title.className = 'class-page__title';
  title.textContent = cls.title;

  const context = document.createElement('p');
  context.className = 'class-page__context';
  context.textContent = [yearTitle, subjectTitle].filter(Boolean).join(' · ');

  section.append(heading, title);
  if (context.textContent) {
    section.append(context);
  }
  return section;
}

function buildCurrentUnitSection(
  cls: Class,
  unitsById: Map<string, { id: string; title: string }>
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__section';
  section.dataset.classSection = 'current-unit';

  const heading = document.createElement('h2');
  heading.className = 'class-page__heading';
  heading.textContent = 'Current unit';
  section.append(heading);

  const unitId = cls.current_unit_id;
  const unit = unitId ? unitsById.get(unitId) : undefined;

  if (!unit) {
    section.append(emptyCopy('No current unit.'));
    return section;
  }

  const path = `/units/${unit.id}`;
  const link = document.createElement('a');
  link.className = 'class-page__link';
  link.href = path;
  link.textContent = unit.title;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });
  section.append(link);
  return section;
}

function buildCurrentLessonSection(
  cls: Class,
  curriculum: CurriculumResponse,
  lessonsById: Map<string, CurriculumLessonSummary>
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__section';
  section.dataset.classSection = 'current-lesson';

  const heading = document.createElement('h2');
  heading.className = 'class-page__heading';
  heading.textContent = 'Current lesson';
  section.append(heading);

  const scheduled = resolveCurrentScheduledLesson(cls, curriculum);
  if (!scheduled) {
    section.append(emptyCopy('No current lesson.'));
    return section;
  }

  const lesson = lessonsById.get(scheduled.lesson_id);
  const title = lesson?.title ?? scheduled.lesson_id;
  const path = `/lessons/${scheduled.lesson_id}`;

  const row = document.createElement('div');
  row.className = 'class-page__current-lesson';

  const label = document.createElement('p');
  label.className = 'class-page__current-lesson-title';
  label.textContent = title;

  const open = document.createElement('a');
  open.className = 'btn btn--secondary';
  open.href = path;
  open.textContent = 'Open';
  open.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });

  row.append(label, open);
  section.append(row);
  return section;
}

function buildScheduleSection(
  cls: Class,
  curriculum: CurriculumResponse,
  lessonsById: Map<string, CurriculumLessonSummary>,
  options: ClassPageOptions
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__section';
  section.dataset.classSection = 'schedule';

  const header = document.createElement('div');
  header.className = 'class-page__section-header';

  const heading = document.createElement('h2');
  heading.className = 'class-page__heading';
  heading.textContent = 'Schedule';

  const scheduleUnit = document.createElement('button');
  scheduleUnit.type = 'button';
  scheduleUnit.className = 'btn btn--primary class-schedule__schedule-unit';
  scheduleUnit.textContent = 'Schedule unit';
  scheduleUnit.addEventListener('click', () => {
    options.onScheduleUnit?.();
  });

  header.append(heading, scheduleUnit);
  section.append(header);

  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');
  section.append(errorBanner);

  const entries = curriculum.scheduled_lessons
    .filter((entry) => entry.class_id === cls.id)
    .sort(compareScheduledLessons);

  if (entries.length === 0) {
    section.append(emptyCopy('No scheduled lessons.'));
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list class-schedule';

  for (const entry of entries) {
    const lesson = lessonsById.get(entry.lesson_id);
    const isCurrent = cls.current_scheduled_lesson_id === entry.id;
    const item = document.createElement('li');
    item.className = `lesson-list__item class-schedule__row${isCurrent ? ' is-current' : ''}`;

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson?.title ?? entry.lesson_id;

    const controls = document.createElement('div');
    controls.className = 'class-schedule__controls';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'class-schedule__date';
    dateInput.value = entry.date;
    dateInput.dataset.scheduleAction = 'date';
    dateInput.addEventListener('change', () => {
      const previousDate = entry.date;
      void runScheduleMutation(
        options,
        errorBanner,
        async () => {
          if (dateInput.value && dateInput.value !== previousDate) {
            await patchScheduledLesson(entry.id, { date: dateInput.value });
          }
        },
        () => {
          dateInput.value = previousDate;
        }
      );
    });

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = entry.delivery_status;

    controls.append(dateInput, meta);
    info.append(title, controls);

    const actions = document.createElement('div');
    actions.className = 'class-schedule__actions';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn btn--ghost class-schedule__action';
    up.textContent = 'Up';
    up.dataset.scheduleAction = 'up';
    up.addEventListener('click', () => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(entry.id, { direction: 'up' });
      });
    });

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'btn btn--ghost class-schedule__action';
    down.textContent = 'Down';
    down.dataset.scheduleAction = 'down';
    down.addEventListener('click', () => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(entry.id, { direction: 'down' });
      });
    });

    const setCurrent = document.createElement('button');
    setCurrent.type = 'button';
    setCurrent.className = 'btn btn--secondary class-schedule__action';
    setCurrent.textContent = 'Set current';
    setCurrent.dataset.scheduleAction = 'set-current';
    setCurrent.disabled = isCurrent;
    setCurrent.addEventListener('click', () => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchClass(cls.id, { current_scheduled_lesson_id: entry.id });
      });
    });

    const path = `/lessons/${entry.lesson_id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open class-schedule__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    actions.append(up, down, setCurrent, open);
    item.append(info, actions);
    list.append(item);
  }

  section.append(list);
  return section;
}

async function runScheduleMutation(
  options: ClassPageOptions,
  errorBanner: HTMLElement,
  mutate: () => void | Promise<void>,
  onError?: () => void
): Promise<void> {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
  try {
    await mutate();
    await options.onScheduleMutated?.();
  } catch (error) {
    const message =
      error instanceof ApiClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to update schedule.';
    errorBanner.hidden = false;
    errorBanner.textContent = message;
    onError?.();
  }
}

function buildUnitsSection(
  cls: Class,
  unitsById: Map<string, { id: string; title: string }>
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__section';
  section.dataset.classSection = 'units';

  const heading = document.createElement('h2');
  heading.className = 'class-page__heading';
  heading.textContent = 'Units';
  section.append(heading);

  const units = cls.active_unit_ids
    .map((id) => unitsById.get(id))
    .filter((unit): unit is { id: string; title: string } => Boolean(unit));

  if (units.length === 0) {
    section.append(emptyCopy('No active units.'));
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'class-page__unit-list';

  for (const unit of units) {
    const item = document.createElement('li');
    const path = `/units/${unit.id}`;
    const link = document.createElement('a');
    link.className = 'class-page__link';
    link.href = path;
    link.textContent = unit.title;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });
    item.append(link);
    list.append(item);
  }

  section.append(list);
  return section;
}

function buildHomepageSection(cls: Class, options: ClassPageOptions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'class-page__homepage';
  section.dataset.classSection = 'homepage';

  const toolbar = document.createElement('div');
  toolbar.className = 'class-page__homepage-toolbar';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'btn btn--secondary class-page__edit-homepage';
  editButton.textContent = 'Edit homepage';

  const viewAsStudent = document.createElement('a');
  viewAsStudent.className = 'btn btn--ghost class-page__view-as-student';
  viewAsStudent.href = `/s/classes/${cls.id}`;
  viewAsStudent.textContent = 'View as student';
  viewAsStudent.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(`/s/classes/${cls.id}`);
  });

  toolbar.append(editButton, viewAsStudent);

  const regionsContainer = document.createElement('div');
  regionsContainer.className = 'class-page__homepage-regions';

  let editorHandle: HomepageEditorHandle | null = null;

  function showViewMode(): void {
    editorHandle?.destroy();
    editorHandle = null;
    editButton.hidden = false;
    renderHomepageRegionsView(regionsContainer, normalizeHomepage(cls.homepage));
  }

  function showEditMode(): void {
    editButton.hidden = true;
    editorHandle?.destroy();
    editorHandle = mountHomepageEditor(regionsContainer, normalizeHomepage(cls.homepage), {
      onSave: async (homepage) => {
        await patchClass(cls.id, { homepage });
        await options.onScheduleMutated?.();
      },
      onCancel: () => {
        showViewMode();
      }
    });
  }

  editButton.addEventListener('click', () => {
    showEditMode();
  });

  showViewMode();
  section.append(toolbar, regionsContainer);
  return section;
}

function resolveCurrentScheduledLesson(
  cls: Class,
  curriculum: CurriculumResponse
): ScheduledLesson | undefined {
  if (cls.current_scheduled_lesson_id) {
    const pinned = curriculum.scheduled_lessons.find(
      (entry) => entry.id === cls.current_scheduled_lesson_id && entry.class_id === cls.id
    );
    if (pinned) return pinned;
  }

  const anchor = resolveScheduleToday(curriculum.schedule_anchor_date);
  const candidates = curriculum.scheduled_lessons
    .filter((entry) => entry.class_id === cls.id && entry.date >= anchor)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.schedule_order - b.schedule_order;
    });

  return candidates[0];
}

function compareScheduledLessons(a: ScheduledLesson, b: ScheduledLesson): number {
  const byOrder = a.schedule_order - b.schedule_order;
  if (byOrder !== 0) return byOrder;
  return a.date.localeCompare(b.date);
}

function emptyCopy(text: string): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'class-page__empty';
  empty.textContent = text;
  return empty;
}
