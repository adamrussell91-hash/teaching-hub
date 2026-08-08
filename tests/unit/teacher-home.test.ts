import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderTeacherHome } from '@/teacher/home';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  schedule_anchor_date: '2026-08-12',
  classes: [
    {
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_aotfw'],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    }
  ],
  scheduled_lessons: [
    {
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_008',
      date: '2026-08-12',
      schedule_order: 1,
      delivery_status: 'current',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    },
    {
      id: 'scheduled_aotfw_001',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_001',
      date: '2026-08-13',
      schedule_order: 2,
      delivery_status: 'planned',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    }
  ],
  scope_sequences: [],
  media: [],
  lessons: [
    {
      id: 'lesson_aotfw_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_aotfw',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: '2026-08-01T09:00:00.000Z',
      published_at: '2026-02-01T12:00:00.000Z'
    },
    {
      id: 'lesson_aotfw_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: '2026-07-01T00:00:00.000Z'
    }
  ]
};

describe('teacher home dashboard', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('renders Today and This week from the seed schedule', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.textContent).toContain('Today');
    expect(canvas.textContent).toContain('2026-08-12');
    expect(canvas.textContent).toContain('This week');
    expect(canvas.textContent).toContain('12ENGADV1');
    expect(canvas.textContent).toContain('Memory');
    expect(canvas.textContent).toContain('Intro');
  });

  it('lists unpublished changes and recently edited', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.textContent).toContain('Unpublished changes');
    expect(canvas.textContent).toContain('Recently edited');
    const unpublished = canvas.querySelector('[data-home-panel="unpublished"]');
    expect(unpublished?.textContent).toContain('Memory');
  });

  it('opens a scheduled lesson via the client-side router', () => {
    renderTeacherHome(canvas, curriculum);
    const open = canvas.querySelector<HTMLAnchorElement>(
      '[data-home-panel="today"] .home-schedule__open'
    );
    expect(open?.getAttribute('href')).toBe('/lessons/lesson_aotfw_008');
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('does not render the old flat all-lessons list', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.querySelector('.lesson-list')).toBeNull();
  });
});
