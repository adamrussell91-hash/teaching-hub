import type { Media } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

export function openUrlForMedia(media: Media): string | undefined {
  const url = media.preview_url ?? media.download_url;
  return url && url.trim() !== '' ? url : undefined;
}

export function renderResourcesIndex(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Resource Library';
  canvas.append(heading);

  const media = curriculum.media
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title));

  if (media.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No resources yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const entry of media) {
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = entry.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = `${entry.media_type} · ${entry.provider}`;

    info.append(title, meta);
    item.append(info);

    const url = openUrlForMedia(entry);
    if (url) {
      const open = document.createElement('a');
      open.className = 'btn btn--secondary lesson-list__open';
      open.href = url;
      open.textContent = 'Open';
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      item.append(open);
    }

    list.append(item);
  }

  canvas.append(list);
}
