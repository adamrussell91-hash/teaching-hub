import type { Block } from '@/schemas/block';

export function filterBlocksForStudent<T extends Pick<Block, 'visibility'>>(
  blocks: T[]
): T[] {
  return blocks.filter((block) => block.visibility === 'student_teacher');
}
