import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import {
  UNITS_INDEX_GROUP_STORAGE_KEY,
  renderUnitsIndex,
  renderUnitStub
} from '@/teacher/sections/units';
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

const year11: Year = {
  id: 'year_11',
  type: 'year',
  title: 'Year 11',
  slug: 'year_11',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 11,
  subject_ids: ['subject_y11_engadv']
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

const engAdvY11: Subject = {
  id: 'subject_y11_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 11 English Advanced',
  slug: 'english_advanced_y11',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_11',
  unit_ids: ['unit_othello'],
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
  lesson_ids: ['lesson_001', 'lesson_002'],
  cover: { url: 'https://cdn.example.com/aotfw.jpg' }
};

const othello: Unit = {
  id: 'unit_othello',
  type: 'unit',
  title: 'Othello',
  slug: 'othello',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_11',
  subject_id: 'subject_y11_engadv',
  lesson_ids: []
};

const curriculum: CurriculumResponse = {
  years: [year, year11],
  subjects: [engAdv, engAdvY11],
  units: [unit, othello],
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
    },
    {
      id: 'lesson_002',
      title: 'Themes',
      slug: 'themes',
      unit_id: 'unit_aotfw',
      sequence: 2,
      status: 'active',
      published: true,
      updated_at: ISO
    }
  ],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('units', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    canvas = document.createElement('div');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists compact unit cards with cover, title, and year/subject meta', () => {
    renderUnitsIndex(canvas, curriculum);
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Units');
    expect(canvas.querySelector('[data-create-trigger]')?.getAttribute('aria-label')).toMatch(
      /unit/i
    );

    const aotfw = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]')!;
    expect(aotfw.querySelector('.units-index__title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(aotfw.querySelector('.units-index__meta')?.textContent).toBe(
      'Year 12 · English Advanced'
    );
    expect(aotfw.querySelector<HTMLImageElement>('.entity-cover-tile__media img')?.src).toBe(
      'https://cdn.example.com/aotfw.jpg'
    );

    const othelloCard = canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_othello"]')!;
    expect(othelloCard.querySelector('.entity-cover-tile__media')).toBeTruthy();
    expect(othelloCard.querySelector('.entity-cover-tile__media img')).toBeNull();
  });

  it('does not show archive or trash on the units index', () => {
    renderUnitsIndex(canvas, curriculum);
    expect(canvas.textContent).not.toMatch(/Archive/);
    expect(canvas.textContent).not.toMatch(/Trash/);
  });

  it('groups units by subject by default', () => {
    renderUnitsIndex(canvas, curriculum);
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['English Advanced']);
    expect(
      canvas.querySelector('[data-units-group="subject"]')?.getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('regroups by year level when that filter is selected', () => {
    renderUnitsIndex(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('[data-units-group="year"]')!.click();
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['Year 11', 'Year 12']);
    expect(localStorage.getItem(UNITS_INDEX_GROUP_STORAGE_KEY)).toBe('year');
  });

  it('restores the last grouping choice', () => {
    localStorage.setItem(UNITS_INDEX_GROUP_STORAGE_KEY, 'year');
    renderUnitsIndex(canvas, curriculum);
    const headings = [...canvas.querySelectorAll('.units-index__group-title')].map(
      (el) => el.textContent
    );
    expect(headings).toEqual(['Year 11', 'Year 12']);
  });

  it('opens the unit page route', () => {
    renderUnitsIndex(canvas, curriculum);
    canvas.querySelector<HTMLAnchorElement>('a[href="/units/unit_aotfw"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
  });

  it('lists unit lessons in sequence and opens the editor', () => {
    renderUnitStub(canvas, curriculum, 'unit_aotfw');
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe(
      'Artist of the Floating World'
    );
    expect(canvas.querySelector('[data-export="unit"]')?.textContent).toMatch(/Export JSON/);
    expect(canvas.querySelector('[data-unit-section="plan"]')).toBeTruthy();
    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['Introduction', 'Themes']);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_002');
  });

  it('edits the unit plan with the lesson palette canvas', () => {
    renderUnitStub(canvas, curriculum, 'unit_aotfw');
    const plan = canvas.querySelector('[data-unit-section="plan"]');
    expect(plan?.querySelector('.lesson-palette')).not.toBeNull();
    expect(plan?.querySelector('.lesson-page')).not.toBeNull();
    expect(plan?.querySelector('.unit-plan-editor__add-select')).toBeNull();
    const families = [...(plan?.querySelectorAll('.lesson-palette__family') ?? [])].map((el) =>
      el.getAttribute('data-family')
    );
    expect(families).not.toContain('Learning');
    expect(families).toContain('Layout');
  });

  it('renders not-found for an unknown unit', () => {
    renderUnitStub(canvas, curriculum, 'unit_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
