import type { Block } from '@/schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;

export function filterBlocksForStudent(blocks: Block[]): Block[] {
  return blocks
    .filter((block) => block.visibility === 'student_teacher')
    .map((block) => {
      if (block.block_type === 'section') {
        return {
          ...block,
          content: {
            ...block.content,
            blocks: filterBlocksForStudent(block.content.blocks) as SectionBlock['content']['blocks']
          }
        };
      }
      if (block.block_type === 'columns') {
        return {
          ...block,
          content: {
            ...block.content,
            columns: block.content.columns.map((col) => ({
              ...col,
              blocks: filterBlocksForStudent(col.blocks) as ColumnsBlock['content']['columns'][number]['blocks']
            }))
          }
        };
      }
      return block;
    });
}
