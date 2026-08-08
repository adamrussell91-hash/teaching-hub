import { apiGet, ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import { renderBlock } from '@/blocks/render';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { scheduleNeighbors } from '@/schedule/schedule-neighbors';
import {
  fetchPublishedClass,
  type PublishedClass
} from '@/student/published-class';

export interface MountStudentLessonViewOptions {
  root: HTMLElement;
  lessonId: string;
  classId?: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentLessonViewHandle {
  dispose(): void;
}

function createShell(): { surface: HTMLElement; header: HTMLElement; content: HTMLElement } {
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

function renderHeader(header: HTMLElement, unitId: string): void {
  header.replaceChildren();

  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';

  const back = document.createElement('a');
  back.className = 'student-surface__back';
  back.href = `/s/units/${unitId}`;
  back.textContent = 'Back to unit';

  header.append(brand, back);
}

function renderClassScopedHeader(
  header: HTMLElement,
  classId: string,
  unitId: string
): void {
  header.replaceChildren();

  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';

  const links = document.createElement('div');
  links.className = 'student-surface__header-links';

  const backClass = document.createElement('a');
  backClass.className = 'student-surface__back student-surface__back-class';
  backClass.href = `/s/classes/${classId}`;
  backClass.textContent = 'Back to class';

  const backUnit = document.createElement('a');
  backUnit.className = 'student-surface__back student-surface__back-unit';
  backUnit.href = `/s/units/${unitId}`;
  backUnit.textContent = 'Back to unit';

  links.append(backClass, backUnit);
  header.append(brand, links);
}

function renderStatus(content: HTMLElement, text: string): void {
  content.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  content.append(status);
}

function renderPublishedLesson(content: HTMLElement, lesson: PublishedLesson): void {
  content.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'student-surface__title';
  title.textContent = lesson.title;
  content.append(title);

  for (const block of lesson.blocks) {
    content.append(renderBlock(block, 'student'));
  }
}

function wideNavLabels(): boolean {
  return window.matchMedia('(min-width: 40rem)').matches;
}

function renderLessonNav(
  content: HTMLElement,
  classId: string,
  lessonId: string,
  cls: PublishedClass
): void {
  const { prev, next } = scheduleNeighbors(cls.schedule, lessonId);
  if (!prev && !next) return;

  const nav = document.createElement('nav');
  nav.className = 'student-lesson__nav';
  const useTitles = wideNavLabels();

  if (prev) {
    const href = `/s/classes/${classId}/lessons/${prev.lesson_id}`;
    const link = document.createElement('a');
    link.className = 'student-lesson__nav-prev';
    link.href = href;
    link.textContent = useTitles ? prev.title : 'Previous';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(href);
    });
    nav.append(link);
  }

  if (next) {
    const href = `/s/classes/${classId}/lessons/${next.lesson_id}`;
    const link = document.createElement('a');
    link.className = 'student-lesson__nav-next';
    link.href = href;
    link.textContent = useTitles ? next.title : 'Next';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(href);
    });
    nav.append(link);
  }

  content.append(nav);
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'not_found';
}

function loadErrorMessage(
  error: unknown,
  notFoundMessage: string,
  genericMessage = 'Unable to load lesson. Please refresh to try again.'
): string {
  return isNotFound(error) ? notFoundMessage : genericMessage;
}

/**
 * Loads a published lesson snapshot and renders the public student reading
 * surface: minimal chrome, lesson title, and student-visible blocks only.
 * With `classId`, validates schedule membership and adds class chrome + footer.
 */
export function mountStudentLessonView(
  options: MountStudentLessonViewOptions
): StudentLessonViewHandle {
  const { root, lessonId, classId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createShell();
  root.append(surface);

  renderStatus(content, 'Loading lesson…');

  if (classId) {
    void Promise.allSettled([
      apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`),
      fetchPublishedClass(classId)
    ]).then(([lessonResult, classResult]) => {
      if (disposed || isStale()) return;

      if (lessonResult.status === 'rejected') {
        renderStatus(
          content,
          loadErrorMessage(
            lessonResult.reason,
            'Lesson not found.',
            'Unable to load lesson. Please refresh to try again.'
          )
        );
        return;
      }

      if (classResult.status === 'rejected') {
        renderStatus(
          content,
          loadErrorMessage(
            classResult.reason,
            'Class not found.',
            'Unable to load class. Please refresh to try again.'
          )
        );
        return;
      }

      const lesson = lessonResult.value;
      const cls = classResult.value;
      const row = cls.schedule.find((entry) => entry.lesson_id === lessonId);
      if (!row || !row.published) {
        renderStatus(content, 'Lesson not found.');
        return;
      }

      renderClassScopedHeader(header, classId, lesson.unit_id);
      renderPublishedLesson(content, lesson);
      renderLessonNav(content, classId, lessonId, cls);
    });
  } else {
    void apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`)
      .then((lesson) => {
        if (disposed || isStale()) return;
        renderHeader(header, lesson.unit_id);
        renderPublishedLesson(content, lesson);
      })
      .catch((error: unknown) => {
        if (disposed || isStale()) return;
        renderStatus(content, loadErrorMessage(error, 'Lesson not found.'));
      });
  }

  return {
    dispose() {
      disposed = true;
    }
  };
}
