import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import {
  renderScopeSequencesIndex,
  renderScopeSequenceStub
} from '@/teacher/sections/scope-sequences';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Subject, Year } from '@/schemas';

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
  subject_ids: ['subject_y12_engadv', 'subject_y12_engstd']
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
  unit_ids: [],
  outcome_ids: [],
  class_ids: []
};

const engStd: Subject = {
  ...engAdv,
  id: 'subject_y12_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard'
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv, engStd],
  units: [],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  schedule_anchor_date: '2026-08-12'
};

describe('scope & sequences', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists one row per subject with year context', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['English Advanced', 'English Standard']);
    const meta = [...canvas.querySelectorAll('.lesson-list__meta')].map((el) => el.textContent);
    expect(meta).toEqual(['Year 12', 'Year 12']);
  });

  it('opens the subject stub route', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[0].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/scope-sequences/subject_y12_engadv');
  });

  it('renders a stub for a known subject', () => {
    renderScopeSequenceStub(canvas, curriculum, 'subject_y12_engadv');
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('English Advanced');
    expect(canvas.textContent).toMatch(/Scope & Sequence[\s\S]*coming next/i);
  });

  it('renders not-found for an unknown subject', () => {
    renderScopeSequenceStub(canvas, curriculum, 'subject_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
