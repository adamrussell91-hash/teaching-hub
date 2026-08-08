import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderScopeTimelineEditor } from '@/teacher/sections/scope-timeline';
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
  scope_id: 'scope_y12_engadv_2026',
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
    },
    {
      id: 'ti_note_1',
      kind: 'note',
      title: 'Assessment week',
      start_week: 19,
      end_week: 19,
      order: 2
    }
  ]
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv],
  units: [unit],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [scope],
  schedule_anchor_date: '2026-08-12'
};

describe('scope timeline editor', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('renders subject heading, term labels, and seeded unit title', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('English Advanced');
    const terms = [...canvas.querySelectorAll('.scope-timeline__term')].map((el) => el.textContent);
    expect(terms).toEqual(['Term 1', 'Term 2', 'Term 3', 'Term 4']);
    const unitItem = canvas.querySelector('.scope-timeline__item--unit');
    expect(unitItem?.textContent).toBe('Artist of the Floating World');
    expect(canvas.querySelector('.scope-timeline__item--note')?.textContent).toBe('Assessment week');
    expect(canvas.querySelector('.scope-timeline__inspector-empty')?.textContent).toMatch(
      /Select an item/i
    );
  });

  it('selects an item and populates the inspector', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    const unitItem = canvas.querySelector<HTMLElement>('.scope-timeline__item--unit');
    unitItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(unitItem?.classList.contains('scope-timeline__item--selected')).toBe(true);
    expect(canvas.querySelector('.scope-timeline__inspector-title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(canvas.querySelector('.scope-timeline__inspector-weeks')?.textContent).toBe(
      'Weeks 12–18'
    );
  });

  it('opens a unit from the inspector', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    canvas
      .querySelector<HTMLAnchorElement>('.scope-timeline__open-unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
  });

  it('navigates on double-click of a unit item', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
  });

  it('renders not-found for an unknown subject', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_missing');
    expect(canvas.textContent).toMatch(/Subject not found/i);
  });

  it('renders not-found when subject has no scope', () => {
    const withoutScope: CurriculumResponse = {
      ...curriculum,
      subjects: [{ ...engAdv, scope_id: undefined }]
    };
    renderScopeTimelineEditor(canvas, withoutScope, 'subject_y12_engadv');
    expect(canvas.textContent).toMatch(/Scope & Sequence not found/i);
  });

  it('renders not-found when scope blob is missing', () => {
    const missingScope: CurriculumResponse = {
      ...curriculum,
      scope_sequences: []
    };
    renderScopeTimelineEditor(canvas, missingScope, 'subject_y12_engadv');
    expect(canvas.textContent).toMatch(/Scope & Sequence not found/i);
  });

  it('shows Unknown unit when the unit blob is missing', () => {
    const noUnits: CurriculumResponse = { ...curriculum, units: [] };
    renderScopeTimelineEditor(canvas, noUnits, 'subject_y12_engadv');
    expect(canvas.querySelector('.scope-timeline__item--unit')?.textContent).toBe('Unknown unit');
  });
});
