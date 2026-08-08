import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
    dispose = undefined;
  });

  afterEach(() => {
    dispose?.();
  });

  it('renders Clinical Glass structure with clock, signals, week, and classes', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    expect(
      canvas.querySelector('[data-home-hero-clock], .home-dashboard__hero-time')
    ).not.toBeNull();
    expect(canvas.querySelector('[data-home-panel="signals"]')).not.toBeNull();
    expect(canvas.querySelector('[data-home-panel="week"]')).not.toBeNull();
    expect(canvas.querySelector('[data-home-panel="classes"]')).not.toBeNull();
    expect(canvas.textContent).toContain('Teaching Dashboard');
    expect(canvas.textContent).toMatch(/\b\d{1,2}\b/);
  });

  it('shows weekday day numbers in week columns and lesson links', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    const dayNumbers = [
      ...canvas.querySelectorAll('.home-week__day-number')
    ].map((el) => el.textContent);
    expect(dayNumbers).toEqual(['10', '11', '12', '13', '14']);

    const lessonLink = canvas.querySelector<HTMLAnchorElement>(
      'a.home-week__card[href="/lessons/lesson_aotfw_008"]'
    );
    expect(lessonLink).not.toBeNull();
    expect(lessonLink?.textContent).toContain('Memory');

    lessonLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('links class tiles to /classes/:id', () => {
    const result = renderTeacherHome(canvas, curriculum);
    dispose = result.dispose;

    const classTile = canvas.querySelector<HTMLAnchorElement>(
      'a.home-class-tile[href="/classes/class_2026_12engadv1"]'
    );
    expect(classTile).not.toBeNull();
    classTile?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
  });

  it('dispose clears the clock interval without throwing', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const result = renderTeacherHome(canvas, curriculum);
    expect(() => result.dispose()).not.toThrow();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
