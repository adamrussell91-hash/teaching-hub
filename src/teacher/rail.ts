import type { CurriculumResponse } from '@/teacher/nav';
import { renderClassesNav } from '@/teacher/nav';
import { renderPrimaryNav } from '@/teacher/primary-nav';
import type { TeacherSection } from '@/teacher/section';

export function renderTeacherRail(
  railNav: HTMLElement,
  curriculum: CurriculumResponse,
  options: {
    activeSection: TeacherSection;
    activeClassId?: string;
    onCreateClass?: () => void;
  }
): void {
  railNav.replaceChildren();

  const primaryHost = document.createElement('div');
  primaryHost.className = 'teacher-layout__primary-nav-host';
  const treeHost = document.createElement('div');
  treeHost.className = 'teacher-layout__tree-host';

  railNav.append(primaryHost, treeHost);
  renderPrimaryNav(primaryHost, { activeSection: options.activeSection });
  renderClassesNav(treeHost, curriculum, {
    activeClassId: options.activeClassId,
    onCreateClass: options.onCreateClass
  });
}
