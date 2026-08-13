import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { renderLessonList } from '@/teacher/lesson-list';
import { renderPageHeader } from '@/teacher/page-header';

export interface LessonsIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
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

  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Lessons', actions: [createHost] });

  const createControl = mountCreateControl(createHost, {
    context: 'lessons',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const listHost = document.createElement('div');
  listHost.className = 'lessons-index__list';

  canvas.append(listHost);
  renderLessonList(listHost, curriculum, { heading: null, onMutated: options.onMutated });

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}
