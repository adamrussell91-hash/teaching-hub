import { describe, it, expect, vi } from 'vitest';

vi.mock('@/app/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/router')>();
  return { ...actual, navigate: vi.fn() };
});

import { renderTeacherRail } from '@/teacher/rail';
import type { CurriculumResponse } from '@/teacher/nav';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  lessons: []
};

describe('renderTeacherRail', () => {
  it('renders primary nav above an empty curriculum tree host', () => {
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, { activeSection: 'classes' });
    expect(railNav.querySelector('.primary-nav')).not.toBeNull();
    expect(railNav.querySelector('[aria-current="page"]')?.textContent).toBe('Classes');
    expect(railNav.querySelector('.teacher-layout__tree-host')).not.toBeNull();
  });
});
