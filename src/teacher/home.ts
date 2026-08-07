import { navigate } from '@/app/router';
import type { CurriculumResponse } from './nav';

/**
 * Lightweight home canvas: a flat list of seed lessons with Open links.
 * Deliberately not a metrics dashboard for this slice.
 */
export function renderTeacherHome(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Lessons';
  canvas.append(heading);

  if (curriculum.lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons yet.';
    canvas.append(empty);
    return;
  }

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));

  const sortedLessons = [...curriculum.lessons].sort((a, b) => {
    if (a.unit_id !== b.unit_id) return a.unit_id.localeCompare(b.unit_id);
    return a.sequence - b.sequence;
  });

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const lesson of sortedLessons) {
    const unit = unitsById.get(lesson.unit_id);

    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [unit?.title ?? lesson.unit_id, lesson.published ? 'Published' : 'Draft'].join(' · ');

    info.append(title, meta);

    const path = `/lessons/${lesson.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(info, open);
    list.append(item);
  }

  canvas.append(list);
}
