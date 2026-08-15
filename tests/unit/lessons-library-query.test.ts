import { describe, expect, it } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Unit } from '@/schemas';
import type { LessonLibraryRow } from '@/teacher/lessons-library/types';
import { DEFAULT_LESSONS_STATE } from '@/teacher/lessons-library/types';
import {
  applyLessonsQuery,
  countActiveFilters,
  groupLessonsByUnit,
  lessonBadge,
  searchHaystack
} from '@/teacher/lessons-library/query';

const ISO = '2026-01-01T00:00:00.000Z';
const LATER = '2026-08-01T00:00:00.000Z';

function unit(partial: Pick<Unit, 'id' | 'title'> & Partial<Unit>): Unit {
  return {
    type: 'unit',
    slug: partial.id,
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    year_id: 'year_12',
    subject_id: 'subject_eng',
    lesson_ids: [],
    ...partial
  };
}

function lesson(row: LessonLibraryRow): LessonLibraryRow {
  return row;
}

const units = [
  unit({ id: 'unit_aotfw', title: 'Artist of the Floating World' }),
  unit({ id: 'unit_hamlet', title: 'Hamlet' })
];

const lessons: LessonLibraryRow[] = [
  lesson({
    id: 'l1',
    title: 'Introduction to Ono',
    slug: 'intro-ono',
    unit_id: 'unit_aotfw',
    sequence: 1,
    status: 'active',
    published: false,
    updated_at: ISO,
    created_at: ISO,
    tags: ['module-c'],
    excerpt: 'Guilt and complicity in post-war Japan.'
  }),
  lesson({
    id: 'l2',
    title: 'Close reading: floating world',
    slug: 'close-reading',
    unit_id: 'unit_aotfw',
    sequence: 2,
    status: 'active',
    published: true,
    updated_at: LATER,
    created_at: ISO,
    tags: ['assessment', 'module-c'],
    excerpt: 'Passage analysis of memory and art.'
  }),
  lesson({
    id: 'l3',
    title: 'Hamlet essay workshop',
    slug: 'essay',
    unit_id: 'unit_hamlet',
    sequence: 1,
    status: 'archived',
    published: true,
    updated_at: LATER,
    created_at: LATER,
    tags: ['assessment'],
    review_status: 'needs_review'
  })
];

const curriculum = {
  years: [],
  subjects: [],
  units,
  lessons,
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
} as unknown as CurriculumResponse;

describe('lessons library query', () => {
  it('defaults to active lessons sorted by last edited newest first', () => {
    const result = applyLessonsQuery(curriculum, DEFAULT_LESSONS_STATE);
    expect(result.totalInLibrary).toBe(2);
    expect(result.rows.map((r) => r.id)).toEqual(['l2', 'l1']);
  });

  it('matches partial query against title, unit, tags, and excerpt', () => {
    expect(searchHaystack(lessons[0]!, 'Artist of the Floating World').includes('floating')).toBe(
      true
    );
    const byUnit = applyLessonsQuery(curriculum, { ...DEFAULT_LESSONS_STATE, q: 'floating world' });
    expect(byUnit.rows.map((r) => r.id).sort()).toEqual(['l1', 'l2']);
    const byExcerpt = applyLessonsQuery(curriculum, { ...DEFAULT_LESSONS_STATE, q: 'complicity' });
    expect(byExcerpt.rows.map((r) => r.id)).toEqual(['l1']);
  });

  it('ANDs unit, status, and tag filters and reports counts', () => {
    const result = applyLessonsQuery(curriculum, {
      ...DEFAULT_LESSONS_STATE,
      units: ['unit_aotfw'],
      statuses: ['published'],
      tags: ['assessment']
    });
    expect(result.rows.map((r) => r.id)).toEqual(['l2']);
    expect(result.shown).toBe(1);
    expect(countActiveFilters(result.state)).toBe(3);
  });

  it('includes archived only when that status is selected', () => {
    const result = applyLessonsQuery(curriculum, {
      ...DEFAULT_LESSONS_STATE,
      statuses: ['archived']
    });
    expect(result.rows.map((r) => r.id)).toEqual(['l3']);
    expect(lessonBadge(result.rows[0]!)).toBe('archived');
  });

  it('groups by unit with published/draft breakdown', () => {
    const result = applyLessonsQuery(curriculum, DEFAULT_LESSONS_STATE);
    const groups = groupLessonsByUnit(result.rows, units);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.unitTitle).toBe('Artist of the Floating World');
    expect(groups[0]?.lessons).toHaveLength(2);
    expect(groups[0]?.published).toBe(1);
    expect(groups[0]?.draft).toBe(1);
  });

  it('sorts by title A–Z', () => {
    const result = applyLessonsQuery(curriculum, { ...DEFAULT_LESSONS_STATE, sort: 'title_asc' });
    expect(result.rows.map((r) => r.title)).toEqual([
      'Close reading: floating world',
      'Introduction to Ono'
    ]);
  });
});
