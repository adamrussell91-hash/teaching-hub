import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import type { PublishedLesson } from '@/schemas/published-lesson';

export interface MountStudentLessonViewOptions {
  root: HTMLElement;
  lessonId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentLessonViewHandle {
  dispose(): void;
}

function createShell(): { surface: HTMLElement; content: HTMLElement } {
  const surface = document.createElement('div');
  surface.className = 'student-surface';

  const header = document.createElement('header');
  header.className = 'student-surface__header';
  header.textContent = 'Teaching Hub';

  const content = document.createElement('div');
  content.className = 'student-surface__content';

  surface.append(header, content);
  return { surface, content };
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

/**
 * Loads a published lesson snapshot and renders the public student reading
 * surface: minimal chrome, lesson title, and student-visible blocks only.
 */
export function mountStudentLessonView(
  options: MountStudentLessonViewOptions
): StudentLessonViewHandle {
  const { root, lessonId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, content } = createShell();
  root.append(surface);

  renderStatus(content, 'Loading lesson…');

  void apiGet<PublishedLesson>(`/api/published/lessons/${lessonId}`)
    .then((lesson) => {
      if (disposed || isStale()) return;
      renderPublishedLesson(content, lesson);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Lesson not found.'
          : 'Unable to load lesson. Please refresh to try again.';
      renderStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}
