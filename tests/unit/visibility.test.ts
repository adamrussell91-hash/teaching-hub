import { describe, it, expect } from 'vitest';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Block } from '@/schemas/block';

type VisibilityBlock = Pick<Block, 'id' | 'visibility'>;

describe('filterBlocksForStudent', () => {
  it('drops teacher_only blocks for students', () => {
    const blocks: VisibilityBlock[] = [
      { visibility: 'student_teacher', id: 'a' },
      { visibility: 'teacher_only', id: 'b' }
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps all student_teacher blocks', () => {
    const blocks: VisibilityBlock[] = [
      { visibility: 'student_teacher', id: 'a' },
      { visibility: 'student_teacher', id: 'c' }
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when all blocks are teacher_only', () => {
    const blocks: VisibilityBlock[] = [
      { visibility: 'teacher_only', id: 'x' },
      { visibility: 'teacher_only', id: 'y' }
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out).toEqual([]);
  });
});
