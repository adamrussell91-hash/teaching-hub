import { navigate } from '@/app/router';
import type { TeacherSection } from '@/teacher/section';

export interface PrimaryNavOptions {
  activeSection: TeacherSection;
}

const SECTIONS: Array<{ id: TeacherSection; label: string; path: string }> = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'classes', label: 'Classes', path: '/classes' },
  { id: 'scope-sequences', label: 'Scope & Sequences', path: '/scope-sequences' },
  { id: 'units', label: 'Units', path: '/units' },
  { id: 'lessons', label: 'Lessons', path: '/lessons' },
  { id: 'templates', label: 'Templates', path: '/templates' },
  { id: 'resources', label: 'Resource Library', path: '/resources' },
  { id: 'trash', label: 'Trash', path: '/trash' }
];

export function renderPrimaryNav(container: HTMLElement, options: PrimaryNavOptions): void {
  container.replaceChildren();

  const nav = document.createElement('div');
  nav.className = 'primary-nav';
  nav.setAttribute('aria-label', 'Teacher sections');

  for (const section of SECTIONS) {
    const link = document.createElement('a');
    link.className = 'primary-nav__link';
    link.href = section.path;
    link.textContent = section.label;
    if (section.id === options.activeSection) {
      link.setAttribute('aria-current', 'page');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(section.path);
    });
    nav.append(link);
  }

  container.append(nav);
}
