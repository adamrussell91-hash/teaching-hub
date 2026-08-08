import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

export function renderUnitsIndex(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Units';
  canvas.append(heading);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const units = [...curriculum.units].sort((a, b) => a.title.localeCompare(b.title));

  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No units yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const unit of units) {
    const subject = subjectsById.get(unit.subject_id);
    const year = yearsById.get(unit.year_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = unit.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

    info.append(title, meta);

    const path = `/units/${unit.id}`;
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

export function renderUnitStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string
): void {
  canvas.replaceChildren();
  const unit = curriculum.units.find((entry) => entry.id === unitId);

  if (!unit) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Unit not found.';
    canvas.append(status);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = unit.title;
  canvas.append(heading);

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.unit_id === unitId)
    .sort((a, b) => a.sequence - b.sequence);

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons in this unit yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const lesson of lessons) {
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = lesson.published ? 'Published' : 'Draft';

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
