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
    onOpenSearch?: () => void;
  }
): void {
  railNav.replaceChildren();

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'rail-search';
  searchBtn.textContent = 'Search';
  searchBtn.addEventListener('click', () => options.onOpenSearch?.());

  const primaryHost = document.createElement('div');
  primaryHost.className = 'teacher-layout__primary-nav-host';
  const treeHost = document.createElement('div');
  treeHost.className = 'teacher-layout__tree-host';

  railNav.append(searchBtn, primaryHost, treeHost);
  renderPrimaryNav(primaryHost, { activeSection: options.activeSection });
  renderClassesNav(treeHost, curriculum, {
    activeClassId: options.activeClassId,
    onCreateClass: options.onCreateClass
  });
}
