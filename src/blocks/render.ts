import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { videoEmbedSrc } from '@/blocks/video-url';
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

export function renderImageBlock(
  block: Extract<Block, { block_type: 'image' }>,
  mode: RenderMode
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-image';
  const img = document.createElement('img');
  img.src = block.content.url;
  img.alt = block.content.alt_text;
  img.loading = 'lazy';
  figure.append(img);
  if (block.content.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-image__caption';
    cap.textContent = block.content.caption;
    figure.append(cap);
  }
  return wrapBlock(figure, block, mode);
}

export function renderVideoBlock(
  block: Extract<Block, { block_type: 'video' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-video';
  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'block-video__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }
  const iframe = document.createElement('iframe');
  iframe.className = 'block-video__frame';
  iframe.src = videoEmbedSrc(block.content.provider, block.content.external_id);
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute(
    'allow',
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
  );
  iframe.title = block.content.title || 'Video';
  wrap.append(iframe);
  if (block.content.caption) {
    const cap = document.createElement('p');
    cap.className = 'block-video__caption';
    cap.textContent = block.content.caption;
    wrap.append(cap);
  }
  return wrapBlock(wrap, block, mode);
}

export function renderEmbedBlock(
  block: Extract<Block, { block_type: 'embed' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-embed';
  const iframe = document.createElement('iframe');
  iframe.className = 'block-embed__frame';
  iframe.src = block.content.url;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
  iframe.title = block.content.title || 'Embedded content';
  wrap.append(iframe);

  const link = document.createElement('a');
  link.className = 'block-embed__open';
  link.href = block.content.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = block.content.title?.trim() || 'Open in new tab';
  wrap.append(link);

  return wrapBlock(wrap, block, mode);
}

export function renderHtmlBlock(
  block: Extract<Block, { block_type: 'html' }>,
  mode: RenderMode
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-html';
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  return wrapBlock(body, block, mode);
}

export function renderBlock(block: Block, mode: RenderMode): HTMLElement {
  switch (block.block_type) {
    case 'rich_text':
      return renderRichTextBlock(block, mode);
    case 'heading':
      return renderHeadingBlock(block, mode);
    case 'callout':
      return renderCalloutBlock(block, mode);
    case 'image':
      return renderImageBlock(block, mode);
    case 'video':
      return renderVideoBlock(block, mode);
    case 'embed':
      return renderEmbedBlock(block, mode);
    case 'html':
      return renderHtmlBlock(block, mode);
  }
}
