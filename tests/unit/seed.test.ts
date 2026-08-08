import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  YearSchema,
  SubjectSchema,
  UnitSchema,
  LessonSchema,
  ClassSchema,
  ScheduledLessonSchema
} from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as {
  years: unknown[];
  subjects: unknown[];
  units: unknown[];
  lessons: unknown[];
  classes: unknown[];
  scheduled_lessons: unknown[];
  schedule_anchor_date: string;
};

describe('seed fixtures', () => {
  it('parses all years through YearSchema', () => {
    for (const year of seed.years) {
      YearSchema.parse(year);
    }
    expect(seed.years).toHaveLength(1);
  });

  it('parses all subjects through SubjectSchema', () => {
    for (const subject of seed.subjects) {
      SubjectSchema.parse(subject);
    }
    expect(seed.subjects).toHaveLength(2);
  });

  it('parses all units through UnitSchema', () => {
    for (const unit of seed.units) {
      UnitSchema.parse(unit);
    }
    expect(seed.units).toHaveLength(1);
  });

  it('parses all lessons through LessonSchema', () => {
    for (const lesson of seed.lessons) {
      LessonSchema.parse(lesson);
    }
    expect(seed.lessons.length).toBeGreaterThanOrEqual(8);
  });

  it('parses all classes through ClassSchema', () => {
    for (const cls of seed.classes) {
      ClassSchema.parse(cls);
    }
    expect(seed.classes).toHaveLength(1);
  });

  it('parses all scheduled lessons through ScheduledLessonSchema', () => {
    for (const scheduled of seed.scheduled_lessons) {
      ScheduledLessonSchema.parse(scheduled);
    }
    expect(seed.scheduled_lessons).toHaveLength(5);
    expect(seed.schedule_anchor_date).toBe('2026-08-12');
  });

  it('keeps English Advanced and Standard as separate subjects', () => {
    const adv = SubjectSchema.parse(
      seed.subjects.find(
        (s) => (s as { id: string }).id === 'subject_y12_engadv'
      )
    );
    const std = SubjectSchema.parse(
      seed.subjects.find(
        (s) => (s as { id: string }).id === 'subject_y12_engstd'
      )
    );
    expect(adv.id).not.toBe(std.id);
    expect(adv.unit_ids).toContain('unit_aotfw');
    expect(std.unit_ids).toHaveLength(0);
  });

  it('lesson_aotfw_008 has mixed visibilities and all block types', () => {
    const lesson = LessonSchema.parse(
      seed.lessons.find(
        (l) => (l as { id: string }).id === 'lesson_aotfw_008'
      )
    );

    const blockTypes = new Set(lesson.blocks.map((b) => b.block_type));
    expect(blockTypes).toEqual(
      new Set(['rich_text', 'heading', 'callout'])
    );

    const visibilities = new Set(lesson.blocks.map((b) => b.visibility));
    expect(visibilities).toEqual(
      new Set(['student_teacher', 'teacher_only'])
    );

    const teacherOnlyCallouts = lesson.blocks.filter(
      (b) =>
        b.block_type === 'callout' && b.visibility === 'teacher_only'
    );
    expect(teacherOnlyCallouts.length).toBeGreaterThanOrEqual(1);
  });
});
