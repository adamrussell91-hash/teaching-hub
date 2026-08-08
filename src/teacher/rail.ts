import type { CurriculumResponse } from '@/teacher/nav';
import { renderCurriculumNav } from '@/teacher/nav';
import { renderPrimaryNav } from '@/teacher/primary-nav';
import type { TeacherSection } from '@/teacher/section';

export function renderTeacherRail(
  railNav: HTMLElement,
  curriculum: CurriculumResponse,
  options: { activeSection: TeacherSection; activeLessonId?: string }
): void {
  railNav.replaceChildren();

  const primaryHost = document.createElement('div');
  primaryHost.className = 'teacher-layout__primary-nav-host';
  const treeHost = document.createElement('div');
  treeHost.className = 'teacher-layout__tree-host';

  railNav.append(primaryHost, treeHost);
  renderPrimaryNav(primaryHost, { activeSection: options.activeSection });
  renderCurriculumNav(treeHost, curriculum, { activeLessonId: options.activeLessonId });
}
