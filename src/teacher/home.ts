import type { CurriculumResponse } from './nav';
import { renderLessonList } from './lesson-list';

/**
 * Lightweight home canvas: a flat list of seed lessons with Open links.
 * Deliberately not a metrics dashboard for this slice.
 */
export function renderTeacherHome(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  renderLessonList(canvas, curriculum, { heading: 'Lessons' });
}
