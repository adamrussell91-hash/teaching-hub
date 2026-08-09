import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { isHttpUrl } from '@/blocks/url-safety';
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
  figure.className = `block-image block-image--${block.variant}`;
  if (isHttpUrl(block.content.url)) {
    const img = document.createElement('img');
    img.src = block.content.url;
    img.alt = block.content.alt_text;
    img.loading = 'lazy';
    figure.append(img);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-image__unavailable';
    unavailable.textContent = block.content.alt_text.trim() || 'Image unavailable.';
    figure.append(unavailable);
  }
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
  wrap.className = `block-video block-video--${block.variant}`;
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
  const safeUrl = isHttpUrl(block.content.url) ? block.content.url.trim() : undefined;

  if (safeUrl) {
    const iframe = document.createElement('iframe');
    iframe.className = 'block-embed__frame';
    iframe.src = safeUrl;
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    iframe.title = block.content.title || 'Embedded content';
    wrap.append(iframe);

    const link = document.createElement('a');
    link.className = 'block-embed__open';
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = block.content.title?.trim() || 'Open in new tab';
    wrap.append(link);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-embed__unavailable';
    unavailable.textContent = 'Embed unavailable.';
    wrap.append(unavailable);
  }

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

export function renderQuoteBlock(
  block: Extract<Block, { block_type: 'quote' }>,
  mode: RenderMode
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-quote';

  const quote = document.createElement('blockquote');
  quote.className = 'block-quote__text';
  quote.textContent = block.content.quote;
  figure.append(quote);

  const attribution = block.content.attribution?.trim();
  const source = block.content.source?.trim();
  const reference = block.content.reference?.trim();
  if (attribution || source || reference) {
    const caption = document.createElement('figcaption');
    caption.className = 'block-quote__attribution';
    const parts = [attribution, source, reference].filter(Boolean);
    caption.textContent = parts.join(' — ');
    figure.append(caption);
  }

  return wrapBlock(figure, block, mode);
}

export function renderDividerBlock(
  block: Extract<Block, { block_type: 'divider' }>,
  mode: RenderMode
): HTMLElement {
  const hr = document.createElement('hr');
  hr.className = 'block-divider';
  return wrapBlock(hr, block, mode);
}

export function renderDefinitionBlock(
  block: Extract<Block, { block_type: 'definition' }>,
  mode: RenderMode
): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'block-definition';

  const dt = document.createElement('dt');
  dt.className = 'block-definition__term';
  dt.textContent = block.content.term;

  const dd = document.createElement('dd');
  dd.className = 'block-definition__definition';
  dd.textContent = block.content.definition;

  dl.append(dt, dd);
  return wrapBlock(dl, block, mode);
}

export function renderCodeBlock(
  block: Extract<Block, { block_type: 'code' }>,
  mode: RenderMode
): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'block-code';
  if (block.content.language) {
    pre.dataset.language = block.content.language;
  }

  const code = document.createElement('code');
  code.textContent = block.content.code;
  pre.append(code);

  return wrapBlock(pre, block, mode);
}

export function renderAudioBlock(
  block: Extract<Block, { block_type: 'audio' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-audio';

  if (block.content.title?.trim()) {
    const title = document.createElement('p');
    title.className = 'block-audio__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  if (isHttpUrl(block.content.url)) {
    const audio = document.createElement('audio');
    audio.className = 'block-audio__player';
    audio.controls = true;
    audio.src = block.content.url.trim();
    wrap.append(audio);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-audio__unavailable';
    unavailable.textContent = 'Audio unavailable.';
    wrap.append(unavailable);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderAttachmentBlock(
  block: Extract<Block, { block_type: 'attachment' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-attachment';

  if (isHttpUrl(block.content.url)) {
    const link = document.createElement('a');
    link.className = 'block-attachment__link';
    link.href = block.content.url.trim();
    link.download = block.content.filename?.trim() || '';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = block.content.title.trim() || block.content.filename?.trim() || 'Download';
    wrap.append(link);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-attachment__unavailable';
    unavailable.textContent = block.content.title.trim() || 'Attachment unavailable.';
    wrap.append(unavailable);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderAccordionBlock(
  block: Extract<Block, { block_type: 'accordion' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-accordion';

  for (const item of block.content.items) {
    const details = document.createElement('details');
    details.className = 'block-accordion__item';

    const summary = document.createElement('summary');
    summary.className = 'block-accordion__title';
    summary.textContent = item.title;

    const body = document.createElement('div');
    body.className = 'block-accordion__body';
    body.textContent = item.body;

    details.append(summary, body);
    wrap.append(details);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderTableBlock(
  block: Extract<Block, { block_type: 'table' }>,
  mode: RenderMode
): HTMLElement {
  const table = document.createElement('table');
  table.className = 'block-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const header of block.content.headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const row of block.content.rows) {
    const tr = document.createElement('tr');
    const cellCount = Math.max(block.content.headers.length, row.length);
    for (let i = 0; i < cellCount; i += 1) {
      const td = document.createElement('td');
      td.textContent = row[i] ?? '';
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);

  return wrapBlock(table, block, mode);
}

export function renderQuestionSetBlock(
  block: Extract<Block, { block_type: 'question_set' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-question-set';

  if (block.content.title?.trim()) {
    const title = document.createElement('p');
    title.className = 'block-question-set__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  const list = document.createElement('ol');
  list.className = 'block-question-set__list';

  for (const question of block.content.questions) {
    const li = document.createElement('li');
    li.className = 'block-question-set__question';

    const prompt = document.createElement('p');
    prompt.className = 'block-question-set__prompt';
    prompt.textContent = question.prompt;
    li.append(prompt);

    if (question.kind === 'multiple_choice' && question.options?.length) {
      const options = document.createElement('ul');
      options.className = 'block-question-set__options';
      for (const option of question.options) {
        const optionItem = document.createElement('li');
        optionItem.textContent = option;
        options.append(optionItem);
      }
      li.append(options);
    }

    list.append(li);
  }

  wrap.append(list);
  return wrapBlock(wrap, block, mode);
}

export function renderSpacerBlock(
  block: Extract<Block, { block_type: 'spacer' }>,
  mode: RenderMode
): HTMLElement {
  const el = document.createElement('div');
  el.className = `block-spacer block-spacer--${block.content.size}`;
  el.setAttribute('aria-hidden', 'true');
  return wrapBlock(el, block, mode);
}

export function renderSectionBlock(
  block: Extract<Block, { block_type: 'section' }>,
  mode: RenderMode
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'block-section';

  const title = document.createElement('h2');
  title.className = 'block-section__title';
  title.textContent = block.content.title;

  const body = document.createElement('div');
  body.className = 'block-section__body';
  for (const child of block.content.blocks) {
    body.append(renderBlock(child, mode));
  }

  section.append(title, body);
  return wrapBlock(section, block, mode);
}

export function renderColumnsBlock(
  block: Extract<Block, { block_type: 'columns' }>,
  mode: RenderMode
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'block-columns';
  grid.dataset.preset = block.content.preset;
  grid.style.gridTemplateColumns = block.content.columns
    .map((col) => `${col.width}fr`)
    .join(' ');

  for (const col of block.content.columns) {
    const cell = document.createElement('div');
    cell.className = 'block-columns__col';
    cell.dataset.width = String(col.width);
    for (const child of col.blocks) {
      cell.append(renderBlock(child, mode));
    }
    grid.append(cell);
  }

  return wrapBlock(grid, block, mode);
}

export function renderTabsBlock(
  block: Extract<Block, { block_type: 'tabs' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-tabs';

  const tablist = document.createElement('div');
  tablist.className = 'block-tabs__tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Content tabs');

  const panels: HTMLElement[] = [];
  const buttons: HTMLButtonElement[] = [];
  let selected = 0;

  function selectTab(index: number): void {
    selected = index;
    buttons.forEach((btn, i) => {
      const active = i === selected;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
      btn.classList.toggle('block-tabs__tab--active', active);
    });
    panels.forEach((panel, i) => {
      const active = i === selected;
      panel.hidden = !active;
      panel.replaceChildren();
      if (active) {
        for (const child of block.content.tabs[i]!.blocks) {
          panel.append(renderBlock(child, mode));
        }
      }
    });
  }

  block.content.tabs.forEach((panelData, index) => {
    const tabId = `${block.id}-tab-${panelData.id}`;
    const panelId = `${block.id}-panel-${panelData.id}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'block-tabs__tab';
    btn.setAttribute('role', 'tab');
    btn.id = tabId;
    btn.setAttribute('aria-controls', panelId);
    btn.textContent = panelData.label || `Tab ${index + 1}`;
    btn.addEventListener('click', () => selectTab(index));
    buttons.push(btn);
    tablist.append(btn);

    const panel = document.createElement('div');
    panel.className = 'block-tabs__panel';
    panel.setAttribute('role', 'tabpanel');
    panel.id = panelId;
    panel.setAttribute('aria-labelledby', tabId);
    panels.push(panel);
  });

  tablist.addEventListener('keydown', (event) => {
    if (buttons.length === 0) return;
    let next = selected;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (selected + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (selected - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = buttons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectTab(next);
    buttons[next]!.focus();
  });

  root.append(tablist, ...panels);
  selectTab(0);
  return wrapBlock(root, block, mode);
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
    case 'quote':
      return renderQuoteBlock(block, mode);
    case 'divider':
      return renderDividerBlock(block, mode);
    case 'definition':
      return renderDefinitionBlock(block, mode);
    case 'code':
      return renderCodeBlock(block, mode);
    case 'audio':
      return renderAudioBlock(block, mode);
    case 'attachment':
      return renderAttachmentBlock(block, mode);
    case 'accordion':
      return renderAccordionBlock(block, mode);
    case 'table':
      return renderTableBlock(block, mode);
    case 'question_set':
      return renderQuestionSetBlock(block, mode);
    case 'spacer':
      return renderSpacerBlock(block, mode);
    case 'section':
      return renderSectionBlock(block, mode);
    case 'columns':
      return renderColumnsBlock(block, mode);
    case 'tabs':
      return renderTabsBlock(block, mode);
  }
}
