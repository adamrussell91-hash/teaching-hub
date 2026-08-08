import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

export function renderScopeSequencesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse
): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Scope & Sequences';
  canvas.append(heading);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjects = [...curriculum.subjects].sort((a, b) => a.title.localeCompare(b.title));

  if (subjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No subjects yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const subject of subjects) {
    const year = yearsById.get(subject.year_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = subject.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = year?.title ?? subject.year_id;

    info.append(title, meta);

    const path = `/scope-sequences/${subject.id}`;
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

export function renderScopeSequenceStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string
): void {
  canvas.replaceChildren();
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);

  if (!subject) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Subject not found.';
    canvas.append(status);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = subject.title;

  const body = document.createElement('p');
  body.className = 'teacher-layout__canvas-status';
  body.textContent = `Scope & Sequence for ${subject.title} is coming next.`;

  canvas.append(heading, body);
}
