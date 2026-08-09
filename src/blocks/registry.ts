import {
  createAccordionEditor,
  createAttachmentEditor,
  createAudioEditor,
  createBlockEditor,
  createCalloutEditor,
  createCodeEditor,
  createDefinitionEditor,
  createDividerEditor,
  createEmbedEditor,
  createHeadingEditor,
  createHtmlEditor,
  createImageEditor,
  createQuestionSetEditor,
  createQuoteEditor,
  createRichTextEditor,
  createTableEditor,
  createVideoEditor,
  type BlockChangeHandler
} from '@/blocks/editors';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor
} from '@/blocks/layout-editors';
import {
  renderAccordionBlock,
  renderAttachmentBlock,
  renderAudioBlock,
  renderBlock,
  renderCalloutBlock,
  renderCodeBlock,
  renderColumnsBlock,
  renderDefinitionBlock,
  renderDividerBlock,
  renderEmbedBlock,
  renderHeadingBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderRichTextBlock,
  renderSectionBlock,
  renderSpacerBlock,
  renderTableBlock,
  renderVideoBlock,
  type RenderMode
} from '@/blocks/render';
import type { Block } from '@/schemas/block';

type BlockByType = {
  [K in Block['block_type']]: Extract<Block, { block_type: K }>;
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
  },
  quote: {
    render: renderQuoteBlock,
    createEditor: createQuoteEditor
  },
  divider: {
    render: renderDividerBlock,
    createEditor: createDividerEditor
  },
  definition: {
    render: renderDefinitionBlock,
    createEditor: createDefinitionEditor
  },
  code: {
    render: renderCodeBlock,
    createEditor: createCodeEditor
  },
  columns: {
    render: renderColumnsBlock,
    createEditor: createColumnsEditor
  },
  audio: {
    render: renderAudioBlock,
    createEditor: createAudioEditor
  },
  attachment: {
    render: renderAttachmentBlock,
    createEditor: createAttachmentEditor
  },
  accordion: {
    render: renderAccordionBlock,
    createEditor: createAccordionEditor
  },
  table: {
    render: renderTableBlock,
    createEditor: createTableEditor
  },
  question_set: {
    render: renderQuestionSetBlock,
    createEditor: createQuestionSetEditor
  },
  section: {
    render: renderSectionBlock,
    createEditor: createSectionEditor
  },
  spacer: {
    render: renderSpacerBlock,
    createEditor: createSpacerEditor
  }
};

export {
  createAccordionEditor,
  createAttachmentEditor,
  createAudioEditor,
  createBlockEditor,
  createCalloutEditor,
  createCodeEditor,
  createColumnsEditor,
  createDefinitionEditor,
  createDividerEditor,
  createEmbedEditor,
  createHeadingEditor,
  createHtmlEditor,
  createImageEditor,
  createQuestionSetEditor,
  createQuoteEditor,
  createRichTextEditor,
  createSectionEditor,
  createSpacerEditor,
  createTableEditor,
  createVideoEditor,
  renderAccordionBlock,
  renderAttachmentBlock,
  renderAudioBlock,
  renderBlock,
  renderCalloutBlock,
  renderCodeBlock,
  renderColumnsBlock,
  renderDefinitionBlock,
  renderDividerBlock,
  renderEmbedBlock,
  renderHeadingBlock,
  renderHtmlBlock,
  renderImageBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderRichTextBlock,
  renderSectionBlock,
  renderSpacerBlock,
  renderTableBlock,
  renderVideoBlock
};

export type { BlockChangeHandler, RenderMode };
