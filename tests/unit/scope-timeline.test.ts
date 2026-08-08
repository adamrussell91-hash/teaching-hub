import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/scope-api', () => ({
  patchScopeSequence: vi.fn()
}));

import { navigate } from '@/app/router';
import { patchScopeSequence } from '@/teacher/scope-api';
import { renderScopeTimelineEditor } from '@/teacher/sections/scope-timeline';
import type { CurriculumResponse } from '@/teacher/nav';
import type { ScopeSequence, Subject, Unit, Year } from '@/schemas';

const patchScopeSequenceMock = vi.mocked(patchScopeSequence);

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
  unit_ids: ['unit_aotfw', 'unit_hamlet'],
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

const unitOther: Unit = {
  id: 'unit_hamlet',
  type: 'unit',
  title: 'Hamlet',
  slug: 'hamlet',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: []
};

const unitOtherSubject: Unit = {
  id: 'unit_math',
  type: 'unit',
  title: 'Math Unit',
  slug: 'math_unit',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_other',
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

function cloneScope(base: ScopeSequence = scope): ScopeSequence {
  return structuredClone(base);
}

function makeCurriculum(overrides: Partial<CurriculumResponse> = {}): CurriculumResponse {
  return {
    years: [year],
    subjects: [engAdv],
    units: [unit, unitOther, unitOtherSubject],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [cloneScope()],
    schedule_anchor_date: '2026-08-12',
    ...overrides
  };
}

const curriculum: CurriculumResponse = makeCurriculum();

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
    const noUnits = makeCurriculum({ units: [] });
    renderScopeTimelineEditor(canvas, noUnits, 'subject_y12_engadv');
    expect(canvas.querySelector('.scope-timeline__item--unit')?.textContent).toBe('Unknown unit');
  });

  it('lists only subject units not already on the timeline in Add Unit modal', () => {
    renderScopeTimelineEditor(canvas, makeCurriculum(), 'subject_y12_engadv');
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__add-unit')?.click();
    const labels = [...document.querySelectorAll('.scope-timeline__picker-unit')].map(
      (el) => el.textContent
    );
    expect(labels).toContain('Hamlet');
    expect(labels).not.toContain('Artist of the Floating World');
    expect(labels).not.toContain('Math Unit');
    document.querySelector('.scope-timeline__picker')?.remove();
  });

  it('adds a unit via PATCH and refreshes the timeline', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    updated.timeline_items = [
      ...updated.timeline_items,
      {
        id: 'ti_unit_hamlet',
        kind: 'unit',
        unit_id: 'unit_hamlet',
        start_week: 1,
        end_week: 4,
        order: 3
      }
    ];
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__add-unit')?.click();
    document.querySelector<HTMLButtonElement>('.scope-timeline__picker-unit')?.click();

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });

    const [id, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(id).toBe('scope_y12_engadv_2026');
    expect(body.timeline_items).toHaveLength(3);
    const added = body.timeline_items.find(
      (item) => item.kind === 'unit' && item.unit_id === 'unit_hamlet'
    );
    expect(added).toMatchObject({ kind: 'unit', unit_id: 'unit_hamlet', start_week: 1, end_week: 4 });

    await vi.waitFor(() => {
      const titles = [...canvas.querySelectorAll('.scope-timeline__item--unit')].map(
        (el) => el.textContent
      );
      expect(titles).toContain('Hamlet');
    });
  });

  it('shows a banner and aborts when there is no free span for a new unit', async () => {
    const packed: ScopeSequence = {
      ...cloneScope(),
      week_count: 4,
      terms: [{ id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 4 }],
      timeline_items: [
        {
          id: 'ti_unit_aotfw',
          kind: 'unit',
          unit_id: 'unit_aotfw',
          start_week: 1,
          end_week: 4,
          order: 1
        }
      ]
    };
    const local = makeCurriculum({ scope_sequences: [packed] });
    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__add-unit')?.click();
    document.querySelector<HTMLButtonElement>('.scope-timeline__picker-unit')?.click();

    await vi.waitFor(() => {
      const banner = canvas.querySelector<HTMLElement>('.scope-timeline__banner');
      expect(banner?.hidden).toBe(false);
      expect(banner?.textContent).toMatch(/No free span/i);
    });
    expect(patchScopeSequenceMock).not.toHaveBeenCalled();
  });

  it('adds a note at the selected item start week via PATCH', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    updated.timeline_items = [
      ...updated.timeline_items,
      {
        id: 'ti_note_new',
        kind: 'note',
        title: 'Note',
        start_week: 12,
        end_week: 12,
        order: 3
      }
    ];
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__add-note')?.click();

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });

    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    const note = body.timeline_items.find(
      (item) => item.kind === 'note' && item.id !== 'ti_note_1'
    );
    expect(note).toMatchObject({
      kind: 'note',
      title: 'Note',
      start_week: 12,
      end_week: 12
    });
  });

  it('edits a note title on blur and PATCHes', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    const note = updated.timeline_items.find((item) => item.id === 'ti_note_1');
    if (note?.kind === 'note') note.title = 'Exam week';
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--note')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const input = canvas.querySelector<HTMLInputElement>('.scope-timeline__note-title');
    expect(input).toBeTruthy();
    input!.value = 'Exam week';
    input!.dispatchEvent(new Event('blur', { bubbles: true }));

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(body.timeline_items.find((item) => item.id === 'ti_note_1')).toMatchObject({
      kind: 'note',
      title: 'Exam week'
    });
  });

  it('deletes a note via PATCH', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    updated.timeline_items = updated.timeline_items.filter((item) => item.id !== 'ti_note_1');
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--note')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__delete-note')?.click();

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(body.timeline_items.some((item) => item.id === 'ti_note_1')).toBe(false);

    await vi.waitFor(() => {
      expect(canvas.querySelector('.scope-timeline__item--note')).toBeNull();
    });
  });

  it('removes a unit from the timeline via PATCH without deleting the unit blob', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    updated.timeline_items = updated.timeline_items.filter((item) => item.id !== 'ti_unit_aotfw');
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    canvas
      .querySelector<HTMLElement>('.scope-timeline__item--unit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    canvas.querySelector<HTMLButtonElement>('.scope-timeline__remove-unit')?.click();

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(body.timeline_items.some((item) => item.id === 'ti_unit_aotfw')).toBe(false);
    expect(local.units.some((entry) => entry.id === 'unit_aotfw')).toBe(true);

    await vi.waitFor(() => {
      expect(canvas.querySelector('.scope-timeline__item--unit')).toBeNull();
    });
  });

  it('renders resize handles on timeline items', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    const unitItem = canvas.querySelector('.scope-timeline__item--unit');
    expect(unitItem?.querySelector('.scope-timeline__handle--start')).toBeTruthy();
    expect(unitItem?.querySelector('.scope-timeline__handle--end')).toBeTruthy();
    const noteItem = canvas.querySelector('.scope-timeline__item--note');
    expect(noteItem?.querySelector('.scope-timeline__handle--start')).toBeTruthy();
    expect(noteItem?.querySelector('.scope-timeline__handle--end')).toBeTruthy();
  });

  it('moves an item via pointer drag and PATCHes updated weeks', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    const unitItem = updated.timeline_items.find((item) => item.id === 'ti_unit_aotfw');
    if (unitItem) {
      unitItem.start_week = 14;
      unitItem.end_week = 20;
    }
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    const track = canvas.querySelector<HTMLElement>('.scope-timeline__track');
    const item = canvas.querySelector<HTMLElement>('.scope-timeline__item--unit');
    expect(track && item).toBeTruthy();

    vi.spyOn(track!, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    item!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        button: 0,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });

    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(body.timeline_items.find((entry) => entry.id === 'ti_unit_aotfw')).toMatchObject({
      start_week: 14,
      end_week: 20
    });
  });

  it('resizes from the end handle and PATCHes', async () => {
    const local = makeCurriculum();
    const updated = cloneScope();
    const unitItem = updated.timeline_items.find((item) => item.id === 'ti_unit_aotfw');
    if (unitItem) {
      unitItem.end_week = 20;
    }
    patchScopeSequenceMock.mockResolvedValue(updated);

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    const track = canvas.querySelector<HTMLElement>('.scope-timeline__track');
    const item = canvas.querySelector<HTMLElement>('.scope-timeline__item--unit');
    const handle = item?.querySelector<HTMLElement>('.scope-timeline__handle--end');
    expect(track && item && handle).toBeTruthy();

    vi.spyOn(track!, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    handle!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        button: 0,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );

    await vi.waitFor(() => {
      expect(patchScopeSequenceMock).toHaveBeenCalledTimes(1);
    });

    const [, body] = patchScopeSequenceMock.mock.calls[0]!;
    expect(body.timeline_items.find((entry) => entry.id === 'ti_unit_aotfw')).toMatchObject({
      start_week: 12,
      end_week: 20
    });
  });

  it('reverts and shows a banner when drag persist fails', async () => {
    const local = makeCurriculum();
    patchScopeSequenceMock.mockRejectedValue(new Error('network'));

    renderScopeTimelineEditor(canvas, local, 'subject_y12_engadv');
    const track = canvas.querySelector<HTMLElement>('.scope-timeline__track');
    const item = canvas.querySelector<HTMLElement>('.scope-timeline__item--unit');
    expect(track && item).toBeTruthy();

    vi.spyOn(track!, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    item!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        button: 0,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );
    item!.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 120,
        pointerId: 1
      })
    );

    await vi.waitFor(() => {
      const banner = canvas.querySelector<HTMLElement>('.scope-timeline__banner');
      expect(banner?.hidden).toBe(false);
      expect(banner?.textContent).toMatch(/Unable to save timeline/i);
    });

    const refreshed = canvas.querySelector<HTMLElement>('.scope-timeline__item--unit');
    // weeks 12–18 of 40 → left ((12-1)/40)*100 ≈ 27.5%
    expect(parseFloat(refreshed?.style.left || '')).toBeCloseTo(27.5, 5);
  });
});
