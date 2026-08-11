import { describe, expect, it } from 'vitest';
import { applyTrash, applyRestoreFromTrash, applyArchive } from '@/recovery/lifecycle';
import { scanLessonDependencies, scanUnitDependencies } from '@/recovery/dependencies';

describe('lifecycle transitions', () => {
  it('trashes and restores previous_status', () => {
    const archived = { status: 'archived' as const };
    const trashed = applyTrash(archived, '2026-08-11T00:00:00.000Z');
    expect(trashed.status).toBe('trashed');
    expect(trashed.previous_status).toBe('archived');
    expect(trashed.trashed_at).toBe('2026-08-11T00:00:00.000Z');
    const restored = applyRestoreFromTrash(trashed);
    expect(restored.status).toBe('archived');
    expect(restored.trashed_at).toBeUndefined();
    expect(restored.previous_status).toBeUndefined();
  });

  it('archives active content', () => {
    expect(applyArchive({ status: 'active' }).status).toBe('archived');
  });
});

describe('dependency scan', () => {
  it('finds class and schedule refs for units/lessons', () => {
    const unitDeps = scanUnitDependencies('unit_1', {
      classes: [{ id: 'class_1', title: '12ENG', active_unit_ids: ['unit_1'], current_unit_id: 'unit_1' }]
    });
    expect(unitDeps.some((d) => d.type === 'class' && d.id === 'class_1')).toBe(true);

    const lessonDeps = scanLessonDependencies('lesson_1', {
      units: [{ id: 'unit_1', title: 'Unit', lesson_ids: ['lesson_1'] }],
      scheduled_lessons: [{ id: 'sched_1', lesson_id: 'lesson_1', class_id: 'class_1' }]
    });
    expect(lessonDeps.length).toBeGreaterThanOrEqual(2);
  });
});
