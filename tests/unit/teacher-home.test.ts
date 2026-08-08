import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Unit } from '@/schemas';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderTeacherHome } from '@/teacher/home';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const unit: Unit = {
  id: 'unit_aotfw',
  type: 'unit',
  title: 'Artist of the Floating World',
  slug: 'artist_of_the_floating_world',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_engadv',
  lesson_ids: ['lesson_002', 'lesson_001']
};

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [unit],
  lessons: [
    { id: 'lesson_002', title: 'Follow-up', slug: 'follow_up', unit_id: 'unit_aotfw', sequence: 2, status: 'active', published: true, updated_at: ISO },
    { id: 'lesson_001', title: 'Introduction', slug: 'introduction', unit_id: 'unit_aotfw', sequence: 1, status: 'active', published: false, updated_at: ISO }
  ],
  schedule: [],
  schedule_anchor_date: '2026-08-12'
};

describe('teacher home canvas', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists seed lessons sorted by unit and sequence with Draft/Published state', () => {
    renderTeacherHome(canvas, curriculum);

    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['Introduction', 'Follow-up']);

    const meta = [...canvas.querySelectorAll('.lesson-list__meta')].map((el) => el.textContent);
    expect(meta).toEqual([
      'Artist of the Floating World · Draft',
      'Artist of the Floating World · Published'
    ]);
  });

  it('opens a lesson via the client-side router when Open is clicked', () => {
    renderTeacherHome(canvas, curriculum);

    const openLinks = [...canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')];
    expect(openLinks[0].getAttribute('href')).toBe('/lessons/lesson_001');

    openLinks[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_001');
  });

  it('shows an empty state when there are no lessons', () => {
    renderTeacherHome(canvas, { years: [], subjects: [], units: [], lessons: [], schedule: [], schedule_anchor_date: '2026-08-12' });

    expect(canvas.querySelector('.lesson-list')).toBeNull();
    expect(canvas.textContent).toContain('No lessons yet.');
  });
});
