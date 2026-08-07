import {
  createBlockEditor,
  createCalloutEditor,
  createHeadingEditor,
  createRichTextEditor,
  type BlockChangeHandler
} from '@/blocks/editors';
import {
  renderBlock,
  renderCalloutBlock,
  renderHeadingBlock,
  renderRichTextBlock,
  type RenderMode
} from '@/blocks/render';
import type { Block } from '@/schemas/block';

type BlockByType = {
  rich_text: Extract<Block, { block_type: 'rich_text' }>;
  heading: Extract<Block, { block_type: 'heading' }>;
  callout: Extract<Block, { block_type: 'callout' }>;
};

export interface BlockRegistryEntry<T extends Block = Block> {
  render: (block: T, mode: RenderMode) => HTMLElement;
  createEditor: (block: T, onChange: (block: T) => void) => HTMLElement;
}

export const blockRegistry: {
  [K in Block['block_type']]: BlockRegistryEntry<BlockByType[K]>;
} = {
  rich_text: {
    render: renderRichTextBlock,
    createEditor: createRichTextEditor
  },
  heading: {
    render: renderHeadingBlock,
    createEditor: createHeadingEditor
  },
  callout: {
    render: renderCalloutBlock,
    createEditor: createCalloutEditor
  }
};

export {
  createBlockEditor,
  createCalloutEditor,
  createHeadingEditor,
  createRichTextEditor,
  renderBlock,
  renderCalloutBlock,
  renderHeadingBlock,
  renderRichTextBlock
};

export type { BlockChangeHandler, RenderMode };
