import { mountCreateControl } from '@/teacher/create/control';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { promptLessonFromTemplate } from '@/teacher/lessons-library/from-template';
import { renderLessonsLibrary } from '@/teacher/lessons-library/render';
import { renderPageHeader } from '@/teacher/page-header';

export interface LessonsIndexOptions {
  onCreated?: EntityCreatedHandler;
  onMutated?: () => void | Promise<void>;
}

export function renderLessonsIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: LessonsIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'lessons-index__create create-control';
  createHost.dataset.createHost = '';

  const templateBtn = document.createElement('button');
  templateBtn.type = 'button';
  templateBtn.className = 'btn btn--ghost';
  templateBtn.textContent = 'From template';
  templateBtn.addEventListener('click', () => {
    void promptLessonFromTemplate(curriculum).then((id) => {
      if (id) void options.onCreated?.('lesson', id);
    });
  });

  renderPageHeader(canvas, {
    eyebrow: 'Workspace',
    title: 'Lessons',
    actions: [templateBtn, createHost]
  });

  const createControl = mountCreateControl(createHost, {
    context: 'lessons',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const listHost = document.createElement('div');
  listHost.className = 'lessons-index__list';

  canvas.append(listHost);
  const library = renderLessonsLibrary(listHost, curriculum, { onMutated: options.onMutated });
  disposers.push(library.dispose);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}
