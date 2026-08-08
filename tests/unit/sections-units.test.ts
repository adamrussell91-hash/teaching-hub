import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderUnitsIndex, renderUnitStub } from '@/teacher/sections/units';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Subject, Unit, Year } from '@/schemas';

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
  class_ids: []
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
  lesson_ids: ['lesson_001', 'lesson_002']
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv],
  units: [unit],
  lessons: [
    {
      id: 'lesson_001',
      title: 'Introduction',
      slug: 'introduction',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false
    },
    {
      id: 'lesson_002',
      title: 'Themes',
      slug: 'themes',
      unit_id: 'unit_aotfw',
      sequence: 2,
      status: 'active',
      published: true
    }
  ]
};

describe('units', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists unit title with year and subject meta', () => {
    renderUnitsIndex(canvas, curriculum);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Units');
    expect(canvas.querySelector('.lesson-list__title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(canvas.querySelector('.lesson-list__meta')?.textContent).toBe(
      'Year 12 · English Advanced'
    );
  });

  it('opens the unit stub route', () => {
    renderUnitsIndex(canvas, curriculum);
    canvas.querySelector<HTMLAnchorElement>('.lesson-list__open')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
  });

  it('lists unit lessons in sequence and opens the editor', () => {
    renderUnitStub(canvas, curriculum, 'unit_aotfw');
    expect(canvas.querySelector('.home-heading')?.textContent).toBe(
      'Artist of the Floating World'
    );
    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['Introduction', 'Themes']);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_002');
  });

  it('renders not-found for an unknown unit', () => {
    renderUnitStub(canvas, curriculum, 'unit_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
