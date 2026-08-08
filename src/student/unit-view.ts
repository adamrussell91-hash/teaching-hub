import { apiGet, ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import type { PublishedUnit } from '@/schemas/published-unit';

export interface MountStudentUnitViewOptions {
  root: HTMLElement;
  unitId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale?: () => boolean;
}

export interface StudentUnitViewHandle {
  dispose(): void;
}

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

function renderPublishedUnit(content: HTMLElement, unit: PublishedUnit): void {
  content.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'student-surface__title';
  title.textContent = unit.title;
  content.append(title);

  if (unit.lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'student-unit__empty';
    empty.textContent = 'No published lessons in this unit yet.';
    content.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'student-unit__lesson-list';

  for (const lesson of unit.lessons) {
    const item = document.createElement('li');
    item.className = 'student-unit__lesson-item';

    const link = document.createElement('a');
    link.className = 'student-unit__lesson-link';
    const href = `/s/lessons/${lesson.lesson_id}`;
    link.href = href;
    link.textContent = lesson.title;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(href);
    });

    item.append(link);
    list.append(item);
  }

  content.append(list);
}

/**
 * Loads a published unit and renders the public student unit surface:
 * unit title and a list of published lesson links (or empty / not-found copy).
 */
export function mountStudentUnitView(
  options: MountStudentUnitViewOptions
): StudentUnitViewHandle {
  const { root, unitId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, content } = createShell();
  root.append(surface);

  renderStatus(content, 'Loading unit…');

  void apiGet<PublishedUnit>(`/api/published/units/${unitId}`)
    .then((unit) => {
      if (disposed || isStale()) return;
      renderPublishedUnit(content, unit);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Unit not found.'
          : 'Unable to load unit. Please refresh to try again.';
      renderStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}
