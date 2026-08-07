import { describe, it, expect } from 'vitest';
import { filterBlocksForStudent } from '@/blocks/visibility';

describe('filterBlocksForStudent', () => {
  it('drops teacher_only blocks for students', () => {
    const out = filterBlocksForStudent([
      { visibility: 'student_teacher', id: 'a' },
      { visibility: 'teacher_only', id: 'b' }
    ] as any);
    expect(out.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps all student_teacher blocks', () => {
    const out = filterBlocksForStudent([
      { visibility: 'student_teacher', id: 'a' },
      { visibility: 'student_teacher', id: 'c' }
    ] as any);
    expect(out.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when all blocks are teacher_only', () => {
    const out = filterBlocksForStudent([
      { visibility: 'teacher_only', id: 'x' },
      { visibility: 'teacher_only', id: 'y' }
    ] as any);
    expect(out).toEqual([]);
  });
});
