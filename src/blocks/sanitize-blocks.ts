import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import type { Block } from '@/schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;

export function sanitizeBlocksDeep(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.block_type === 'rich_text' || block.block_type === 'html') {
      return {
        ...block,
        content: { html: sanitizeRichTextHtml(block.content.html) }
      };
    }
    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: sanitizeBlocksDeep(block.content.blocks) as SectionBlock['content']['blocks']
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
            blocks: sanitizeBlocksDeep(col.blocks) as ColumnsBlock['content']['columns'][number]['blocks']
          }))
        }
      };
    }
    return block;
  });
}
