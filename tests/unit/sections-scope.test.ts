import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import {
  renderScopeSequencesIndex,
  renderScopeTimelineEditor
} from '@/teacher/sections/scope-sequences';
import type { CurriculumResponse } from '@/teacher/nav';
import type { ScopeSequence, Subject, Unit, Year } from '@/schemas';

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
  scope_id: 'scope_y12_engadv_2026',
  unit_ids: ['unit_aotfw'],
  outcome_ids: [],
  class_ids: []
};

const engStd: Subject = {
  ...engAdv,
  id: 'subject_y12_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard',
  scope_id: undefined,
  unit_ids: []
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
  lesson_ids: []
};

const scope: ScopeSequence = {
  id: 'scope_y12_engadv_2026',
  type: 'scope_sequence',
  title: 'Year 12 English Advanced 2026',
  slug: 'y12_engadv_2026',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  subject_id: 'subject_y12_engadv',
  academic_year: 2026,
  week_count: 40,
  terms: [
    { id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 10 },
    { id: 'term_t2', title: 'Term 2', term_number: 2, start_week: 11, end_week: 20 },
    { id: 'term_t3', title: 'Term 3', term_number: 3, start_week: 21, end_week: 30 },
    { id: 'term_t4', title: 'Term 4', term_number: 4, start_week: 31, end_week: 40 }
  ],
  timeline_items: [
    {
      id: 'ti_unit_aotfw',
      kind: 'unit',
      unit_id: 'unit_aotfw',
      start_week: 12,
      end_week: 18,
      order: 1
    }
  ]
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv, engStd],
  units: [unit],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [scope],
  media: [],
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

  it('opens the subject timeline route', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[0].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/scope-sequences/subject_y12_engadv');
  });

  it('renders the timeline editor for a known subject with a scope', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('English Advanced');
    expect(canvas.querySelector('.scope-timeline')).toBeTruthy();
    expect(canvas.textContent).not.toMatch(/coming next/i);
  });

  it('renders not-found for an unknown subject', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
