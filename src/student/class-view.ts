import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import {
  emptyMessageForCollection,
  resolveCollection
} from '@/blocks/collection-resolve';
import { renderBlock, renderCollectionBlock } from '@/blocks/render';
import { renderCoverBanner } from '@/teacher/cover-picker';
import {
  fetchPublishedClass,
  type PublishedClass,
  type PublishedClassScheduleRow
} from '@/student/published-class';

export interface MountStudentClassViewOptions {
  root: HTMLElement;
  classId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentClassViewHandle {
  dispose(): void;
}

const HOMEPAGE_REGIONS = [
  { key: 'announcements' as const, title: 'Announcements' },
  { key: 'resources' as const, title: 'Resources' },
  { key: 'custom' as const, title: 'Custom' }
];

function createShell(): {
  surface: HTMLElement;
  header: HTMLElement;
  content: HTMLElement;
} {
  const surface = document.createElement('div');
  surface.className = 'student-surface';

  const header = document.createElement('header');
  header.className = 'student-surface__header';
  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';
  header.append(brand);

  const content = document.createElement('div');
  content.className = 'student-surface__content';

  surface.append(header, content);
  return { surface, header, content };
}

function renderStatus(content: HTMLElement, text: string): void {
  content.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  content.append(status);
}

function isLessonPublished(
  lessonId: string,
  schedule: PublishedClassScheduleRow[]
): boolean {
  return schedule.some((row) => row.lesson_id === lessonId && row.published);
}

function buildSection(headingText: string, classSection: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'student-class__section';
  section.dataset.classSection = classSection;

  const heading = document.createElement('h2');
  heading.className = 'student-class__heading';
  heading.textContent = headingText;
  section.append(heading);
  return section;
}

function renderPublishedClass(content: HTMLElement, cls: PublishedClass): void {
  content.replaceChildren();

  const header = document.createElement('header');
  header.className = 'student-class__header';
  header.dataset.classSection = 'header';

  header.append(renderCoverBanner(cls.cover, [], cls.title));

  const code = document.createElement('h1');
  code.className = 'student-surface__title';
  code.textContent = cls.display_name || cls.code;
  header.append(code);

  const title = document.createElement('p');
  title.className = 'student-class__title';
  title.textContent = cls.title;
  header.append(title);
  content.append(header);

  // Announcements always first (empty region omitted for students only when empty —
  // still show if present; teacher always shows empty state).
  const announcementBlocks = cls.homepage.announcements ?? [];
  if (announcementBlocks.length > 0) {
    content.append(renderHomepageRegion(cls, 'announcements', 'Announcements'));
  }

  if (cls.current_unit) {
    const section = buildSection('Current unit', 'current-unit');
    const link = document.createElement('a');
    link.className = 'student-class__link';
    link.href = `/s/units/${cls.current_unit.id}`;
    link.textContent = cls.current_unit.title;
    section.append(link);
    content.append(section);
  }

  if (cls.current_lesson) {
    const section = buildSection('Current lesson', 'current-lesson');
    const row = document.createElement('div');
    row.className = 'student-class__current-lesson';

    const label = document.createElement('p');
    label.className = 'student-class__current-lesson-title';
    label.textContent = cls.current_lesson.title;
    row.append(label);

    if (isLessonPublished(cls.current_lesson.lesson_id, cls.schedule)) {
      const open = document.createElement('a');
      open.className = 'btn btn--secondary student-class__open';
      const href = `/s/classes/${cls.id}/lessons/${cls.current_lesson.lesson_id}`;
      open.href = href;
      open.textContent = 'Open';
      open.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(href);
      });
      row.append(open);
    }

    section.append(row);
    content.append(section);
  }

  const scheduleSection = buildSection('Schedule', 'schedule');
  if (cls.schedule.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'student-class__empty';
    empty.textContent = 'No scheduled lessons.';
    scheduleSection.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'student-class__schedule';

    for (const row of cls.schedule) {
      const item = document.createElement('li');
      item.className = 'student-class__schedule-row';

      const meta = document.createElement('div');
      meta.className = 'student-class__schedule-meta';

      const date = document.createElement('span');
      date.className = 'student-class__schedule-date';
      date.textContent = row.date;

      const lessonTitle = document.createElement('span');
      lessonTitle.className = 'student-class__schedule-title';
      lessonTitle.textContent = row.title;

      meta.append(date, lessonTitle);
      item.append(meta);

      if (row.published) {
        const open = document.createElement('a');
        open.className = 'btn btn--secondary student-class__open';
        const href = `/s/classes/${cls.id}/lessons/${row.lesson_id}`;
        open.href = href;
        open.textContent = 'Open';
        open.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(href);
        });
        item.append(open);
      }

      list.append(item);
    }

    scheduleSection.append(list);
  }
  content.append(scheduleSection);

  const unitsSection = buildSection('Active units', 'active-units');
  if (cls.active_units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'student-class__empty';
    empty.textContent = 'No active units.';
    unitsSection.append(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'class-page__unit-gallery';

    for (const unit of cls.active_units) {
      const href = `/s/units/${unit.id}`;
      const card = document.createElement('a');
      card.className = 'class-page__unit-card entity-cover-tile';
      card.href = href;
      card.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(href);
      });
      card.append(renderCoverBanner(unit.cover, [], unit.title));
      const footer = document.createElement('div');
      footer.className = 'entity-cover-tile__body';
      const unitTitle = document.createElement('p');
      unitTitle.className = 'home-class-tile__title';
      unitTitle.textContent = unit.title;
      footer.append(unitTitle);
      card.append(footer);
      grid.append(card);
    }

    unitsSection.append(grid);
  }
  content.append(unitsSection);

  for (const region of HOMEPAGE_REGIONS) {
    if (region.key === 'announcements') continue;
    const blocks = cls.homepage[region.key] ?? [];
    if (blocks.length === 0) continue;
    content.append(renderHomepageRegion(cls, region.key, region.title));
  }
}

function renderHomepageRegion(
  cls: PublishedClass,
  key: 'announcements' | 'resources' | 'custom',
  title: string
): HTMLElement {
  const section = buildSection(title, `homepage-${key}`);
  section.dataset.homepageRegion = key;

  const list = document.createElement('div');
  list.className = 'student-class__blocks';
  for (const block of cls.homepage[key] ?? []) {
    if (block.block_type === 'collection') {
      const ctx = {
        currentUnitId: cls.current_unit?.id,
        unitLessons: (cls.current_unit?.lessons ?? []).map((l) => ({
          lesson_id: l.id,
          title: l.title
        })),
        schedule: cls.schedule.map((row) => ({
          lesson_id: row.lesson_id,
          title: row.title,
          schedule_order: row.schedule_order,
          published: row.published
        }))
      };
      const links = resolveCollection(block.content, ctx, { publishedOnly: true });
      const emptyMessage = emptyMessageForCollection(block.content.source, {
        hasCurrentUnit: Boolean(cls.current_unit?.id),
        linkCount: links.length
      });
      const collectionEl = renderCollectionBlock(block, 'student', { links, emptyMessage });
      for (const anchor of collectionEl.querySelectorAll<HTMLAnchorElement>('a.student-class__link')) {
        const href = anchor.getAttribute('href');
        if (!href) continue;
        anchor.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(href);
        });
      }
      list.append(collectionEl);
    } else {
      list.append(renderBlock(block, 'student'));
    }
  }
  section.append(list);
  return section;
}

/**
 * Loads a published class and renders the public student class surface:
 * header, current unit/lesson, schedule, active units, and homepage regions.
 */
export function mountStudentClassView(
  options: MountStudentClassViewOptions
): StudentClassViewHandle {
  const { root, classId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, content } = createShell();
  root.append(surface);

  renderStatus(content, 'Loading class…');

  void fetchPublishedClass(classId)
    .then((cls) => {
      if (disposed || isStale()) return;
      renderPublishedClass(content, cls);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Class not found.'
          : 'Unable to load class. Please refresh to try again.';
      renderStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}
