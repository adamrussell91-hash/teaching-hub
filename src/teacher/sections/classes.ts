import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import type { CollectionResolveContext } from '@/blocks/collection-resolve';
import type { Class, ScheduledLesson, Unit } from '@/schemas';
import { resolveCoverUrl } from '@/schemas';
import { daysBetween } from '@/schedule/calendar-dates';
import {
  buildClassCalendarModel,
  shiftYearMonth,
  yearMonthFromDate
} from '@/schedule/class-calendar-model';
import { resolveScheduleToday } from '@/schedule/today';
import { unitDateProgress, unitDateSpan } from '@/schedule/unit-progress';
import { renderClassCalendar } from '@/teacher/class-calendar';
import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import { renderEntityBanner } from '@/teacher/entity-banner';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  mountHomepageEditor,
  normalizeHomepage,
  renderHomepageRegionsView,
  type HomepageEditorHandle
} from '@/teacher/sections/homepage-editor';
import { patchClass, patchScheduledLesson } from '@/teacher/schedule-api';
import {
  confirmAndArchive,
  confirmAndTrash,
  entityPath
} from '@/teacher/lifecycle-api';
import { renderUnitSequence } from '@/teacher/unit-sequence';

export interface ClassesIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
  onMutated?: () => void | Promise<void>;
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
  const classes = curriculum.classes
    .filter((cls) => cls.status === 'active')
    .sort((a, b) => a.code.localeCompare(b.code));

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

      const card = document.createElement('div');
      card.className = 'classes-index__card';

      const tile = document.createElement('a');
      tile.className = 'glass-tile home-class-tile entity-cover-tile';
      tile.href = path;
      tile.dataset.classId = cls.id;
      tile.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(path);
      });

      const coverUrl = resolveCoverUrl(cls.cover, curriculum.media);
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

      const eyebrow = document.createElement('p');
      eyebrow.className = 'home-class-tile__eyebrow';
      eyebrow.textContent = [String(cls.academic_year), subject?.title].filter(Boolean).join(' · ');

      const title = document.createElement('p');
      title.className = 'home-class-tile__title';
      title.textContent = cls.code || cls.title;

      body.append(eyebrow, title);
      tile.append(body);

      const actions = document.createElement('div');
      actions.className = 'list-row-actions classes-index__actions';

      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'btn btn--ghost';
      archive.textContent = 'Archive';
      archive.addEventListener('click', () => {
        void (async () => {
          try {
            const ok = await confirmAndArchive(
              entityPath('class', cls.id),
              cls.code || cls.title
            );
            if (ok) await options.onMutated?.();
          } catch {
            window.alert('Unable to archive class.');
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
            const ok = await confirmAndTrash('class', cls.id, cls.code || cls.title);
            if (ok) await options.onMutated?.();
          } catch {
            window.alert('Unable to move class to trash.');
          }
        })();
      });

      actions.append(archive, trash);
      card.append(tile, actions);
      grid.append(card);
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
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const cls = curriculum.classes.find((entry) => entry.id === classId);
  if (!cls) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Class not found.';
    canvas.append(status);
    return { dispose: () => undefined };
  }
  const pageClass: Class = cls;

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const lessonsById = new Map(curriculum.lessons.map((lesson) => [lesson.id, lesson]));

  const year = yearsById.get(cls.year_id);
  const subject = subjectsById.get(cls.subject_id);
  const today = resolveScheduleToday(curriculum.schedule_anchor_date);

  const classScheduled = curriculum.scheduled_lessons
    .filter((entry) => entry.class_id === cls.id)
    .sort(compareScheduledLessons);

  const lessonTitles = new Map(
    curriculum.lessons.map((lesson) => [lesson.id, lesson.title] as const)
  );
  const unitTitles = new Map(curriculum.units.map((unit) => [unit.id, unit.title] as const));

  const activeUnits = cls.active_unit_ids
    .map((id) => unitsById.get(id))
    .filter((unit): unit is Unit => Boolean(unit));

  const root = document.createElement('div');
  root.className = 'class-page';

  // 1. Banner
  const bannerHost = document.createElement('div');
  bannerHost.className = 'class-page__banner';
  const banner = renderEntityBanner(bannerHost, {
    cover: cls.cover,
    media: curriculum.media,
    title: cls.code || cls.title,
    eyebrow: [year?.title, subject?.title].filter(Boolean).join(' · '),
    entityId: cls.id,
    editable: true,
    onSave: async (cover) => {
      await patchClass(cls.id, { cover });
      await options.onScheduleMutated?.();
    }
  });
  disposers.push(banner.dispose);

  // 2. Action row
  const actions = document.createElement('div');
  actions.className = 'class-page__actions';

  const viewAsStudent = document.createElement('a');
  viewAsStudent.className = 'btn btn--ghost class-page__view-as-student';
  viewAsStudent.href = `/s/classes/${cls.id}`;
  viewAsStudent.textContent = 'View as student';
  viewAsStudent.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(`/s/classes/${cls.id}`);
  });

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'btn btn--secondary class-page__edit-homepage';
  editButton.textContent = 'Edit page';

  actions.append(viewAsStudent, editButton);

  // Body
  const body = document.createElement('div');
  body.className = 'class-page__body';

  const main = document.createElement('div');
  main.className = 'class-page__main';

  // 3. Teaching today
  main.append(buildTeachingTodayCard(classScheduled, lessonsById, today));

  // 4. Calendar — local state, re-paint host only
  const calendarHost = document.createElement('div');
  calendarHost.className = 'class-page__calendar-host';
  main.append(calendarHost);

  let selectedDate = today;
  let viewMonth = yearMonthFromDate(today);
  let monthDelta = 0;

  const paintCalendar = (): void => {
    const model = buildClassCalendarModel({
      scheduled: classScheduled,
      lessonTitles,
      today,
      selectedDate,
      viewMonth
    });
    renderClassCalendar(calendarHost, model, {
      onSelectDate: (date) => {
        selectedDate = date;
        monthDelta = 0;
        paintCalendar();
      },
      onShiftMonth: (delta) => {
        viewMonth = shiftYearMonth(viewMonth, delta);
        monthDelta = delta;
        paintCalendar();
      },
      monthDelta,
      unitTitles,
      onNavigate: navigate,
      onScheduleLesson: () => options.onScheduleUnit?.()
    });
  };
  paintCalendar();

  // 5. Unit progress
  const progressUnits =
    cls.current_unit_id && unitsById.has(cls.current_unit_id)
      ? [unitsById.get(cls.current_unit_id)!]
      : activeUnits;
  for (const unit of progressUnits) {
    main.append(buildUnitProgressCard(unit, classScheduled, today));
  }

  // Error banner for sequence mutations
  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');
  main.append(errorBanner);

  // 6. Unit sequence
  const sequenceHost = document.createElement('div');
  sequenceHost.className = 'class-page__sequence-host';
  main.append(sequenceHost);

  const sequence = renderUnitSequence(sequenceHost, {
    units: activeUnits,
    scheduled: classScheduled,
    lessonTitles,
    currentUnitId: cls.current_unit_id ?? activeUnits[0]?.id ?? '',
    classId: cls.id,
    today,
    onMoveUp: (scheduledId) => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(scheduledId, { direction: 'up' });
      });
    },
    onMoveDown: (scheduledId) => {
      void runScheduleMutation(options, errorBanner, async () => {
        await patchScheduledLesson(scheduledId, { direction: 'down' });
      });
    },
    onNavigate: navigate
  });
  disposers.push(sequence.dispose);

  // 7. Side column — announcements + resources + folded custom
  const side = document.createElement('aside');
  side.className = 'class-page__side';

  const sideHost = document.createElement('div');
  sideHost.className = 'class-page__homepage-regions';
  side.append(sideHost);

  const resolveContext = collectionContextForClass(cls, curriculum);
  let editorHandle: HomepageEditorHandle | null = null;

  function showViewMode(): void {
    editorHandle?.destroy();
    editorHandle = null;
    editButton.hidden = false;
    renderHomepageRegionsView(
      sideHost,
      normalizeHomepage(pageClass.homepage),
      resolveContext,
      ['announcements', 'resources', 'custom'],
      {
        emptyCopy: {
          announcements:
            'Nothing posted. Students see announcements at the top of their class page.',
          resources: 'Texts, links and files this class should have alongside every lesson.'
        },
        hideHeadingFor: ['custom'],
        omitEmpty: ['custom']
      }
    );

    const announcements = sideHost.querySelector('[data-homepage-region="announcements"]');
    if (announcements && !announcements.querySelector('.homepage-regions__blocks')) {
      const writeOne = document.createElement('button');
      writeOne.type = 'button';
      writeOne.className = 'btn btn--secondary class-page__write-announcement';
      writeOne.textContent = 'Write one';
      writeOne.addEventListener('click', () => {
        showEditMode();
      });
      announcements.append(writeOne);
    }

    const resources = sideHost.querySelector('[data-homepage-region="resources"]');
    if (resources && !resources.querySelector('.homepage-regions__blocks')) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn--secondary class-page__add-resource';
      add.textContent = 'Add';
      add.addEventListener('click', () => {
        showEditMode();
      });
      resources.append(add);
    }
  }

  function showEditMode(): void {
    editButton.hidden = true;
    editorHandle?.destroy();
    editorHandle = mountHomepageEditor(sideHost, normalizeHomepage(pageClass.homepage), {
      classId: pageClass.id,
      resolveContext,
      onSave: async (homepage) => {
        await patchClass(pageClass.id, { homepage });
        await options.onScheduleMutated?.();
      },
      onRestored: (restored) => {
        pageClass.homepage = normalizeHomepage(restored.homepage);
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
  disposers.push(() => {
    editorHandle?.destroy();
    editorHandle = null;
  });

  body.append(main, side);
  root.append(bannerHost, actions, body);
  canvas.append(root);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

function buildTeachingTodayCard(
  scheduled: ScheduledLesson[],
  lessonsById: Map<string, { id: string; title: string }>,
  today: string
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__teaching-today';
  section.dataset.classSection = 'teaching-today';

  const focus = resolveTeachingFocus(scheduled, today);
  if (!focus) {
    section.append(emptyCopy('No scheduled lessons.'));
    return section;
  }

  const lesson = lessonsById.get(focus.entry.lesson_id);
  const title = lesson?.title ?? focus.entry.lesson_id;
  const path = `/lessons/${focus.entry.lesson_id}`;

  const label = document.createElement('p');
  label.className = 'class-page__teaching-label';
  label.textContent = focus.label;

  const link = document.createElement('a');
  link.className = 'class-page__teaching-title';
  link.href = path;
  link.textContent = title;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });

  section.append(label, link);
  return section;
}

function buildUnitProgressCard(
  unit: Unit,
  scheduled: ScheduledLesson[],
  today: string
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'class-page__unit-progress';
  section.dataset.classSection = 'unit-progress';

  const path = `/units/${unit.id}`;
  const link = document.createElement('a');
  link.className = 'class-page__unit-progress-title';
  link.href = path;
  link.textContent = unit.title;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });
  section.append(link);

  const span = unitDateSpan(unit, scheduled);
  const meta = document.createElement('p');
  meta.className = 'class-page__unit-progress-meta';

  if (!span) {
    meta.textContent = 'Not scheduled';
    section.append(meta);
    return section;
  }

  const { daysElapsed, daysRemaining } = unitDateProgress(span, today);
  const totalDays = Math.max(1, daysBetween(span.start, span.end));
  const weeksTotal = Math.max(1, Math.ceil((totalDays + 1) / 7));
  const weekNow = Math.min(weeksTotal, Math.max(1, Math.floor(daysElapsed / 7) + 1));
  meta.textContent = `Week ${weekNow} of ${weeksTotal} · ${daysRemaining} teaching days left`;
  section.append(meta);

  if (span.source === 'scheduled') {
    const note = document.createElement('p');
    note.className = 'class-page__unit-progress-note';
    note.textContent = 'Dates from the schedule';
    section.append(note);
  }

  return section;
}

/** Prefer today's lesson, else next upcoming, else last taught. */
export function resolveTeachingFocus(
  scheduled: ScheduledLesson[],
  today: string
): {
  entry: ScheduledLesson;
  label: 'Teaching today' | 'Up next' | 'Last taught';
} | null {
  if (scheduled.length === 0) return null;

  const todayEntries = scheduled
    .filter((entry) => entry.date === today)
    .sort((a, b) => a.schedule_order - b.schedule_order);
  if (todayEntries[0]) {
    return { entry: todayEntries[0], label: 'Teaching today' };
  }

  const upcoming = scheduled
    .filter((entry) => entry.date > today)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.schedule_order - b.schedule_order;
    });
  if (upcoming[0]) {
    return { entry: upcoming[0], label: 'Up next' };
  }

  const past = scheduled
    .filter((entry) => entry.date < today)
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.schedule_order - a.schedule_order;
    });
  if (past[0]) {
    return { entry: past[0], label: 'Last taught' };
  }

  return null;
}

function collectionContextForClass(
  cls: Class,
  curriculum: CurriculumResponse
): CollectionResolveContext {
  const unit = cls.current_unit_id
    ? curriculum.units.find((u) => u.id === cls.current_unit_id)
    : undefined;
  const lessonsById = new Map(curriculum.lessons.map((l) => [l.id, l]));
  const unitLessons = (unit?.lesson_ids ?? [])
    .map((id) => {
      const lesson = lessonsById.get(id);
      return lesson ? { lesson_id: lesson.id, title: lesson.title } : null;
    })
    .filter((x): x is { lesson_id: string; title: string } => x !== null);

  const schedule = curriculum.scheduled_lessons
    .filter((row) => row.class_id === cls.id)
    .map((row) => ({
      lesson_id: row.lesson_id,
      title: lessonsById.get(row.lesson_id)?.title ?? row.lesson_id,
      schedule_order: row.schedule_order,
      published: true // teacher preview treats scheduled rows as listable
    }));

  return {
    currentUnitId: cls.current_unit_id,
    unitLessons,
    schedule
  };
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
