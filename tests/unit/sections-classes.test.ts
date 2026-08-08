import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/schedule-api', () => ({
  patchScheduledLesson: vi.fn().mockResolvedValue({}),
  patchClass: vi.fn().mockResolvedValue({}),
  postScheduleUnit: vi.fn().mockResolvedValue({ class: {}, scheduled_lessons: [] })
}));

import { navigate } from '@/app/router';
import { patchClass, patchScheduledLesson } from '@/teacher/schedule-api';
import { renderClassesIndex, renderClassPage } from '@/teacher/sections/classes';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class, ScheduledLesson, Subject, Unit, Year } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const year: Year = {
  id: 'year_12',
  type: 'year',
  title: 'Year 12',
  slug: 'year_12',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 12,
  subject_ids: ['subject_y12_engadv']
};

const engAdv: Subject = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  unit_ids: ['unit_aotfw'],
  outcome_ids: [],
  class_ids: ['class_2026_12engadv1']
};

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
  subject_id: 'subject_y12_engadv',
  lesson_ids: ['lesson_aotfw_008', 'lesson_aotfw_001']
};

const classRow: Class = {
  id: 'class_2026_12engadv1',
  type: 'class',
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  active_unit_ids: ['unit_aotfw'],
  current_unit_id: 'unit_aotfw',
  current_scheduled_lesson_id: 'scheduled_aotfw_008',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledCurrent: ScheduledLesson = {
  id: 'scheduled_aotfw_008',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_aotfw',
  lesson_id: 'lesson_aotfw_008',
  date: '2026-08-12',
  schedule_order: 3,
  delivery_status: 'current',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduledPlanned: ScheduledLesson = {
  id: 'scheduled_aotfw_001',
  type: 'scheduled_lesson',
  class_id: 'class_2026_12engadv1',
  unit_id: 'unit_aotfw',
  lesson_id: 'lesson_aotfw_001',
  date: '2026-08-13',
  schedule_order: 4,
  delivery_status: 'planned',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv],
  units: [unit],
  lessons: [
    {
      id: 'lesson_aotfw_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_aotfw',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: ISO
    },
    {
      id: 'lesson_aotfw_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: ISO
    }
  ],
  classes: [classRow],
  scheduled_lessons: [scheduledCurrent, scheduledPlanned],
  schedule_anchor_date: '2026-08-12'
};

describe('classes section', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists classes with Open to class page', () => {
    renderClassesIndex(canvas, curriculum);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Classes');
    expect(canvas.textContent).toContain('12ENGADV1');
    expect(canvas.textContent).toContain('Year 12 English Advanced');
    expect(canvas.textContent).toContain('English Advanced');

    const open = canvas.querySelector<HTMLAnchorElement>('.class-list__open, .lesson-list__open');
    expect(open?.getAttribute('href')).toBe('/classes/class_2026_12engadv1');
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes/class_2026_12engadv1');
  });

  it('shows empty copy when there are no classes', () => {
    renderClassesIndex(canvas, { ...curriculum, classes: [] });
    expect(canvas.textContent).toContain('No classes yet.');
  });

  it('renders hybrid class page generated sections', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    expect(canvas.textContent).toContain('12ENGADV1');
    expect(canvas.textContent).toContain('Year 12 English Advanced');
    expect(canvas.textContent).toMatch(/Current unit/i);
    expect(canvas.textContent).toContain('Artist of the Floating World');
    expect(canvas.textContent).toMatch(/Current lesson/i);
    expect(canvas.textContent).toContain('Memory');
    expect(canvas.textContent).toMatch(/Schedule/i);
    expect(canvas.textContent).toContain('Intro');
    expect(canvas.textContent).toMatch(/Announcements/i);
    expect(canvas.textContent).toMatch(/Resources/i);
    expect(canvas.textContent).toMatch(/Custom blocks/i);
    expect(canvas.textContent).toMatch(/Coming next/i);

    const unitLink = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]');
    expect(unitLink).not.toBeNull();
  });

  it('opens a scheduled lesson from the schedule', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    const schedule = canvas.querySelector('[data-class-section="schedule"]');
    const open = schedule?.querySelector<HTMLAnchorElement>('.lesson-list__open, .class-schedule__open');
    expect(open).not.toBeNull();
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('opens the current lesson', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    const current = canvas.querySelector('[data-class-section="current-lesson"]');
    const open = current?.querySelector<HTMLAnchorElement>('a');
    expect(open?.getAttribute('href')).toBe('/lessons/lesson_aotfw_008');
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('falls back to earliest scheduled lesson on/after anchor when current is unset', () => {
    const withoutCurrent: CurriculumResponse = {
      ...curriculum,
      classes: [{ ...classRow, current_scheduled_lesson_id: undefined }]
    };
    renderClassPage(canvas, withoutCurrent, 'class_2026_12engadv1');
    const current = canvas.querySelector('[data-class-section="current-lesson"]');
    expect(current?.textContent).toContain('Memory');
  });

  it('shows not found for unknown class', () => {
    renderClassPage(canvas, curriculum, 'class_missing');
    expect(canvas.textContent).toMatch(/Class not found/i);
  });

  it('exposes date, reorder, and set-current controls on schedule rows', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated: vi.fn() });
    const schedule = canvas.querySelector('[data-class-section="schedule"]');
    expect(schedule?.querySelector('[data-schedule-action="set-current"]')).toBeTruthy();
    expect(schedule?.querySelector('[data-schedule-action="up"]')).toBeTruthy();
    expect(schedule?.querySelector('[data-schedule-action="down"]')).toBeTruthy();
    expect(schedule?.querySelector('[data-schedule-action="date"]')).toBeTruthy();
    expect(schedule?.querySelector('.class-schedule__schedule-unit')).toBeTruthy();
    expect(schedule?.querySelector('.class-schedule__row.is-current')).toBeTruthy();
  });

  it('calls schedule API and refresh when reordering a row', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    const up = canvas.querySelector<HTMLButtonElement>('[data-schedule-action="up"]');
    up?.click();
    await vi.waitFor(() => {
      expect(patchScheduledLesson).toHaveBeenCalledWith('scheduled_aotfw_008', { direction: 'up' });
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });

  it('calls schedule API and refresh when setting current lesson', async () => {
    const onScheduleMutated = vi.fn().mockResolvedValue(undefined);
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated });

    const setCurrentButtons = canvas.querySelectorAll<HTMLButtonElement>(
      '[data-schedule-action="set-current"]'
    );
    const enabled = [...setCurrentButtons].find((button) => !button.disabled);
    enabled?.click();
    await vi.waitFor(() => {
      expect(patchClass).toHaveBeenCalledWith('class_2026_12engadv1', {
        current_scheduled_lesson_id: 'scheduled_aotfw_001'
      });
      expect(onScheduleMutated).toHaveBeenCalled();
    });
  });
});
