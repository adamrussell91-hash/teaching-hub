import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Unit } from '@/schemas';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderLessonsIndex } from '@/teacher/sections/lessons';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [
    {
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
      lesson_ids: ['lesson_001']
    } satisfies Unit
  ],
  lessons: [
    {
      id: 'lesson_001',
      title: 'Introduction',
      slug: 'introduction',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: ISO
    }
  ],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  schedule_anchor_date: '2026-08-12'
};

describe('lessons index', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists lessons and opens the editor', () => {
    renderLessonsIndex(canvas, curriculum);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Lessons');
    expect(canvas.querySelector('.lesson-list__title')?.textContent).toBe('Introduction');
    canvas.querySelector<HTMLAnchorElement>('.lesson-list__open')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_001');
  });
});
