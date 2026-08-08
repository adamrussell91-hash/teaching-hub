import type { CurriculumResponse } from '@/teacher/nav';
import { renderLessonList } from '@/teacher/lesson-list';

export function renderLessonsIndex(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  renderLessonList(canvas, curriculum, { heading: 'Lessons' });
}
