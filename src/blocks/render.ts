import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import type { Block } from '@/schemas/block';

export type RenderMode = 'teacher' | 'student';

const HEADING_TAG = {
  page: 'h1',
  section: 'h2',
  subsection: 'h3'
} as const;

/** Semantic callout styles mapped to design-token accent classes. */
export const CALLOUT_STYLE_CLASS = {
  information: 'callout--wave',
  important: 'callout--high-sea',
  warning: 'callout--high-sea',
  extension: 'callout--sand',
  scaffold: 'callout--sand',
  example: 'callout--shore',
  remember: 'callout--shore',
  teacher: 'callout--wave'
} as const;

function wrapBlock(content: HTMLElement, block: Block, mode: RenderMode): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'block';
  wrapper.dataset.blockId = block.id;
  wrapper.dataset.blockType = block.block_type;

  if (mode === 'teacher' && block.visibility === 'teacher_only') {
    wrapper.classList.add('block--teacher-only');
  }

  wrapper.append(content);
  return wrapper;
}

export function renderRichTextBlock(
  block: Extract<Block, { block_type: 'rich_text' }>,
  mode: RenderMode
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-rich-text';
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  return wrapBlock(body, block, mode);
}

export function renderHeadingBlock(
  block: Extract<Block, { block_type: 'heading' }>,
  mode: RenderMode
): HTMLElement {
  const tag = HEADING_TAG[block.variant] ?? 'h2';
  const heading = document.createElement(tag);
  heading.className = `block-heading block-heading--${block.variant}`;
  heading.textContent = block.content.text;
  return wrapBlock(heading, block, mode);
}

export function renderCalloutBlock(
  block: Extract<Block, { block_type: 'callout' }>,
  mode: RenderMode
): HTMLElement {
  const callout = document.createElement('aside');
  const styleClass = CALLOUT_STYLE_CLASS[block.content.style];
  callout.className = `callout ${styleClass}`;
  callout.setAttribute('role', 'note');

  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'callout__title';
    title.textContent = block.content.title;
    callout.append(title);
  }

  const body = document.createElement('p');
  body.className = 'callout__body';
  body.textContent = block.content.body;
  callout.append(body);

  return wrapBlock(callout, block, mode);
}

export function renderBlock(block: Block, mode: RenderMode): HTMLElement {
  switch (block.block_type) {
    case 'rich_text':
      return renderRichTextBlock(block, mode);
    case 'heading':
      return renderHeadingBlock(block, mode);
    case 'callout':
      return renderCalloutBlock(block, mode);
  }
}
