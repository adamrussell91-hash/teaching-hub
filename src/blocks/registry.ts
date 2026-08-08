import {
  createBlockEditor,
  createCalloutEditor,
  createEmbedEditor,
  createHeadingEditor,
  createHtmlEditor,
  createImageEditor,
  createRichTextEditor,
  createVideoEditor,
  type BlockChangeHandler
} from '@/blocks/editors';
import {
  renderBlock,
  renderCalloutBlock,
  renderEmbedBlock,
  renderHeadingBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderRichTextBlock,
  renderVideoBlock,
  type RenderMode
} from '@/blocks/render';
import type { Block } from '@/schemas/block';

type BlockByType = {
  rich_text: Extract<Block, { block_type: 'rich_text' }>;
  heading: Extract<Block, { block_type: 'heading' }>;
  callout: Extract<Block, { block_type: 'callout' }>;
  image: Extract<Block, { block_type: 'image' }>;
  video: Extract<Block, { block_type: 'video' }>;
  embed: Extract<Block, { block_type: 'embed' }>;
  html: Extract<Block, { block_type: 'html' }>;
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
  },
  image: {
    render: renderImageBlock,
    createEditor: createImageEditor
  },
  video: {
    render: renderVideoBlock,
    createEditor: createVideoEditor
  },
  embed: {
    render: renderEmbedBlock,
    createEditor: createEmbedEditor
  },
  html: {
    render: renderHtmlBlock,
    createEditor: createHtmlEditor
  }
};

export {
  createBlockEditor,
  createCalloutEditor,
  createEmbedEditor,
  createHeadingEditor,
  createHtmlEditor,
  createImageEditor,
  createRichTextEditor,
  createVideoEditor,
  renderBlock,
  renderCalloutBlock,
  renderEmbedBlock,
  renderHeadingBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderRichTextBlock,
  renderVideoBlock
};

export type { BlockChangeHandler, RenderMode };
