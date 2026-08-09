import katex from 'katex';
import { buildChartSvg, buildChartTableRows, escapeXml } from '@/blocks/chart-svg';
import {
  layoutConceptMap,
  layoutMindMap,
  type ConceptMapContent,
  type MindMapContent
} from '@/blocks/graph-layout';
import type { CollectionLink } from '@/blocks/collection-resolve';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { isHttpUrl } from '@/blocks/url-safety';
import { videoEmbedSrc } from '@/blocks/video-url';
import {
  loadActivityState,
  parseClozeText,
  saveActivityState,
  shuffleArray,
  storageKey
} from '@/blocks/learning-activity';
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

export function renderTimelineBlock(
  block: Extract<Block, { block_type: 'timeline' }>,
  mode: RenderMode
): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'block-timeline';

  for (const event of block.content.events) {
    const item = document.createElement('li');
    item.className = 'block-timeline__event';

    const when = document.createElement('p');
    when.className = 'block-timeline__when';
    when.textContent = event.when;

    const label = document.createElement('h3');
    label.className = 'block-timeline__label';
    label.textContent = event.label;

    item.append(when, label);

    if (event.description.trim()) {
      const description = document.createElement('p');
      description.className = 'block-timeline__description';
      description.textContent = event.description;
      item.append(description);
    }

    if (event.image_url?.trim()) {
      const img = document.createElement('img');
      img.className = 'block-timeline__image';
      img.src = event.image_url.trim();
      img.alt = event.image_alt ?? '';
      item.append(img);
    }

    if (event.link_url?.trim()) {
      const link = document.createElement('a');
      link.className = 'block-timeline__link';
      link.href = event.link_url.trim();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = event.link_label?.trim() || 'Open link';
      item.append(link);
    }

    list.append(item);
  }

  return wrapBlock(list, block, mode);
}

export function renderCollectionBlock(
  block: Extract<Block, { block_type: 'collection' }>,
  _mode: RenderMode,
  resolved: { links: CollectionLink[]; emptyMessage?: string } = { links: [] }
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block block-collection';
  root.dataset.blockId = block.id;
  root.dataset.collectionSource = block.content.source;

  const titleText = block.content.title?.trim();
  if (titleText) {
    const title = document.createElement('h3');
    title.className = 'block-collection__title';
    title.textContent = titleText;
    root.append(title);
  }

  if (resolved.links.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-collection__empty';
    empty.textContent = resolved.emptyMessage ?? 'No items.';
    root.append(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'block-collection__list';
  for (const link of resolved.links) {
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.className = 'block-collection__link student-class__link';
    anchor.href = link.href;
    anchor.textContent = link.title;
    item.append(anchor);
    list.append(item);
  }
  root.append(list);
  return root;
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

let activeLightboxCleanup: (() => void) | null = null;

function openGalleryLightbox(src: string, alt: string): void {
  activeLightboxCleanup?.();

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'block-gallery-lightbox';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', alt || 'Enlarged image');

  const img = document.createElement('img');
  img.className = 'block-gallery-lightbox__image';
  img.src = src;
  img.alt = alt;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn block-gallery-lightbox__close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close enlarged image');

  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    activeLightboxCleanup = null;
    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  }

  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  document.addEventListener('keydown', onKey);
  activeLightboxCleanup = dismiss;

  backdrop.append(img, close);
  document.body.append(backdrop);
  close.focus();
}

function galleryFigure(
  entry: { url: string; alt_text: string; caption?: string },
  interactive: boolean
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-gallery__item';

  if (isHttpUrl(entry.url)) {
    if (interactive) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-gallery__open';
      button.setAttribute('aria-label', `Enlarge: ${entry.alt_text || 'image'}`);
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      button.append(img);
      button.addEventListener('click', () => openGalleryLightbox(entry.url, entry.alt_text));
      figure.append(button);
    } else {
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      figure.append(img);
    }
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-gallery__unavailable';
    unavailable.textContent = entry.alt_text.trim() || 'Image unavailable.';
    figure.append(unavailable);
  }

  if (entry.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-gallery__caption';
    cap.textContent = entry.caption;
    figure.append(cap);
  }
  return figure;
}

export function renderGalleryBlock(
  block: Extract<Block, { block_type: 'gallery' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-gallery block-gallery--${block.content.layout} block-gallery--${block.variant}`;

  if (block.content.layout === 'carousel') {
    let index = 0;
    const viewport = document.createElement('div');
    viewport.className = 'block-gallery__viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-roledescription', 'carousel');

    const status = document.createElement('p');
    status.className = 'block-gallery__status';
    status.setAttribute('aria-live', 'polite');

    const dots = document.createElement('div');
    dots.className = 'block-gallery__dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Gallery slides');

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn--ghost block-gallery__prev';
    prev.textContent = 'Previous';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--ghost block-gallery__next';
    next.textContent = 'Next';

    function show(i: number): void {
      const len = block.content.items.length;
      index = ((i % len) + len) % len;
      viewport.replaceChildren(galleryFigure(block.content.items[index]!, true));
      status.textContent = `${index + 1} / ${len}`;
      [...dots.children].forEach((dot, di) => {
        (dot as HTMLButtonElement).setAttribute('aria-selected', di === index ? 'true' : 'false');
      });
    }

    block.content.items.forEach((_, di) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'block-gallery__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Slide ${di + 1}`);
      dot.addEventListener('click', () => show(di));
      dots.append(dot);
    });

    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    viewport.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
      }
    });

    const controls = document.createElement('div');
    controls.className = 'block-gallery__controls';
    controls.append(prev, status, next);

    root.append(viewport, controls, dots);
    show(0);
  } else {
    const list = document.createElement('div');
    list.className = 'block-gallery__list';
    for (const entry of block.content.items) {
      list.append(galleryFigure(entry, true));
    }
    root.append(list);
  }

  return wrapBlock(root, block, mode);
}

function activityButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${className}`;
  button.textContent = label;
  return button;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function shuffledOutOfSourceOrder<T>(items: T[]): T[] {
  const shuffled = shuffleArray(items);
  if (items.length > 1 && shuffled.every((item, index) => item === items[index])) {
    return [...shuffled.slice(1), shuffled[0]!];
  }
  return shuffled;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPermutation(value: unknown, expected: string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item): item is string => typeof item === 'string' && expected.includes(item)) &&
    new Set(value).size === expected.length
  );
}

type FlashcardItem = Extract<Block, { block_type: 'flashcards' }>['content']['cards'][number];

function flashcardImage(card: FlashcardItem): HTMLImageElement | null {
  if (!card.image_url || !isHttpUrl(card.image_url)) return null;
  const image = document.createElement('img');
  image.className = 'block-flashcards__image';
  image.src = card.image_url.trim();
  image.alt = card.image_alt ?? '';
  image.loading = 'lazy';
  return image;
}

function paintFlashcardFace(face: HTMLElement, text: string, card?: FlashcardItem): void {
  face.replaceChildren();
  const copy = document.createElement('span');
  copy.className = 'block-flashcards__copy';
  copy.textContent = text;
  const image = card ? flashcardImage(card) : null;
  face.append(...(image ? [image, copy] : [copy]));
}

export function renderFlashcardsBlock(
  block: Extract<Block, { block_type: 'flashcards' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-flashcards';

  if (mode === 'teacher') {
    const preview = document.createElement('div');
    preview.className = 'block-flashcards__card block-flashcards__card--preview';
    const front = document.createElement('div');
    front.className = 'block-flashcards__face block-flashcards__face--front';
    const firstCard = block.content.cards[0];
    paintFlashcardFace(front, firstCard?.front ?? '', firstCard);
    preview.append(front);
    root.append(preview);
    return wrapBlock(root, block, mode);
  }

  type FlashcardsState = { order: string[]; index: number; flipped: boolean };
  const key = storageKey('local', block.id);
  const cardIds = block.content.cards.map((card) => card.id);
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  const saved: FlashcardsState | null =
    rawSaved &&
    isPermutation(rawSaved.order, cardIds) &&
    typeof rawSaved.index === 'number' &&
    Number.isInteger(rawSaved.index) &&
    rawSaved.index >= 0 &&
    rawSaved.index < cardIds.length &&
    typeof rawSaved.flipped === 'boolean'
      ? {
          order: rawSaved.order,
          index: rawSaved.index,
          flipped: rawSaved.flipped
        }
      : null;
  let order = block.content.shuffle
    ? saved
      ? [...saved.order]
      : shuffleArray(cardIds)
    : [...cardIds];
  let index = saved?.index ?? 0;
  let flipped = saved?.flipped ?? false;

  const card = document.createElement('div');
  card.className = 'block-flashcards__card';
  const inner = document.createElement('div');
  inner.className = 'block-flashcards__inner';
  const front = document.createElement('div');
  front.className = 'block-flashcards__face block-flashcards__face--front';
  const back = document.createElement('div');
  back.className = 'block-flashcards__face block-flashcards__face--back';
  inner.append(front, back);
  card.append(inner);

  const status = document.createElement('p');
  status.className = 'block-flashcards__status';
  status.setAttribute('aria-live', 'polite');
  const prev = activityButton('Prev', 'block-flashcards__btn');
  const flip = activityButton('Flip', 'block-flashcards__btn');
  const next = activityButton('Next', 'block-flashcards__btn');
  const reset = activityButton('Reset', 'block-flashcards__btn');

  function persist(): void {
    saveActivityState(key, { order, index, flipped } satisfies FlashcardsState);
  }

  function paint(): void {
    const currentId = order[index]!;
    const current = block.content.cards.find((item) => item.id === currentId)!;
    paintFlashcardFace(front, current.front, current);
    paintFlashcardFace(back, current.back);
    card.classList.toggle('block-flashcards__card--flipped', flipped);
    front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
    flip.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    status.textContent = `${index + 1} / ${order.length}`;
    prev.disabled = index === 0;
    next.disabled = index === order.length - 1;
  }

  function show(nextIndex: number): void {
    index = nextIndex;
    flipped = false;
    paint();
    persist();
  }

  prev.addEventListener('click', () => show(Math.max(0, index - 1)));
  next.addEventListener('click', () => show(Math.min(order.length - 1, index + 1)));
  flip.addEventListener('click', () => {
    flipped = !flipped;
    paint();
    persist();
  });
  reset.addEventListener('click', () => {
    order = block.content.shuffle ? shuffleArray(cardIds) : [...cardIds];
    index = 0;
    flipped = false;
    if (block.content.shuffle && !prefersReducedMotion()) {
      root.classList.add('block-flashcards--shuffling');
      window.setTimeout(() => root.classList.remove('block-flashcards--shuffling'), 280);
    }
    paint();
    persist();
  });

  const controls = document.createElement('div');
  controls.className = 'block-flashcards__controls';
  controls.append(prev, flip, next, reset);
  const printSummary = document.createElement('ol');
  printSummary.className = 'block-flashcards__print';
  printSummary.setAttribute('aria-hidden', 'true');
  for (const item of block.content.cards) {
    const entry = document.createElement('li');
    const frontCopy = document.createElement('p');
    const backCopy = document.createElement('p');
    frontCopy.textContent = `Front: ${item.front}`;
    backCopy.textContent = `Back: ${item.back}`;
    entry.append(frontCopy, backCopy);
    printSummary.append(entry);
  }
  root.append(card, status, controls, printSummary);
  paint();
  persist();
  if (block.content.shuffle && !saved && !prefersReducedMotion()) {
    root.classList.add('block-flashcards--shuffling');
    window.setTimeout(() => root.classList.remove('block-flashcards--shuffling'), 280);
  }
  return wrapBlock(root, block, mode);
}

export function renderClozeBlock(
  block: Extract<Block, { block_type: 'cloze' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-cloze';
  const { segments, blanks } = parseClozeText(block.content.text);

  if (block.content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-cloze__title';
    title.textContent = block.content.title;
    root.append(title);
  }

  const sentence = document.createElement('p');
  sentence.className = 'block-cloze__sentence';

  if (mode === 'teacher') {
    for (const segment of segments) {
      if (segment.type === 'text') {
        sentence.append(document.createTextNode(segment.value));
      } else {
        const blank = document.createElement('span');
        blank.className = 'block-cloze__preview-blank';
        blank.textContent = segment.blank.answer;
        sentence.append(blank);
      }
    }
    root.append(sentence);
    return wrapBlock(root, block, mode);
  }

  type ClozeState = {
    text: string;
    caseSensitive: boolean;
    answers: string[];
    revealed: boolean;
    score: number | null;
  };
  const key = storageKey('local', block.id);
  const caseSensitive = block.content.case_sensitive ?? false;
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  const rawScore = rawSaved?.score;
  const saved: ClozeState | null =
    rawSaved &&
    rawSaved.text === block.content.text &&
    rawSaved.caseSensitive === caseSensitive &&
    Array.isArray(rawSaved.answers) &&
    rawSaved.answers.length === blanks.length &&
    rawSaved.answers.every((answer): answer is string => typeof answer === 'string') &&
    typeof rawSaved.revealed === 'boolean' &&
    (rawScore === null ||
      (typeof rawScore === 'number' &&
        Number.isInteger(rawScore) &&
        rawScore >= 0 &&
        rawScore <= blanks.length))
      ? {
          text: rawSaved.text,
          caseSensitive: rawSaved.caseSensitive,
          answers: rawSaved.answers,
          revealed: rawSaved.revealed,
          score: rawScore
        }
      : null;
  const inputs: HTMLInputElement[] = [];
  let revealed = saved?.revealed ?? false;
  let scoreValue = saved?.score ?? null;
  let bankWords = shuffledOutOfSourceOrder(blanks.map((blank) => blank.answer));

  for (const segment of segments) {
    if (segment.type === 'text') {
      sentence.append(document.createTextNode(segment.value));
      continue;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-cloze__blank';
    input.style.width = `${Math.max(segment.blank.answer.length, 3)}ch`;
    input.setAttribute('aria-label', segment.blank.hint || `Blank ${segment.index + 1}`);
    input.placeholder = segment.blank.hint ?? '';
    input.value = saved?.answers[segment.index] ?? '';
    inputs.push(input);
    sentence.append(input);
  }

  const bank = document.createElement('div');
  bank.className = 'block-cloze__word-bank';
  bank.setAttribute('aria-label', 'Word bank');
  const score = document.createElement('p');
  score.className = 'block-cloze__score';
  score.setAttribute('aria-live', 'polite');

  function answers(): string[] {
    return inputs.map((input) => input.value);
  }

  function persist(): void {
    saveActivityState(key, {
      text: block.content.text,
      caseSensitive,
      answers: answers(),
      revealed,
      score: scoreValue
    } satisfies ClozeState);
  }

  function paintBank(): void {
    bank.replaceChildren();
    for (const word of bankWords) {
      const chip = document.createElement('span');
      chip.className = 'block-cloze__word';
      chip.textContent = word;
      bank.append(chip);
    }
  }

  function paintScore(): void {
    score.textContent = scoreValue === null ? '' : `${scoreValue} / ${blanks.length}`;
  }

  inputs.forEach((input) =>
    input.addEventListener('input', () => {
      scoreValue = null;
      revealed = false;
      inputs.forEach((item) =>
        item.classList.remove('block-cloze__blank--correct', 'block-cloze__blank--incorrect')
      );
      paintScore();
      persist();
    })
  );
  const check = activityButton('Check', 'block-cloze__btn');
  const reveal = activityButton('Reveal', 'block-cloze__btn');
  const reset = activityButton('Reset', 'block-cloze__btn');
  check.addEventListener('click', () => {
    scoreValue = inputs.reduce((total, input, i) => {
      const expected = blanks[i]!.answer.trim();
      const actual = input.value.trim();
      const matches = caseSensitive
        ? actual === expected
        : actual.toLocaleLowerCase() === expected.toLocaleLowerCase();
      input.classList.toggle('block-cloze__blank--correct', matches);
      input.classList.toggle('block-cloze__blank--incorrect', !matches);
      return total + Number(matches);
    }, 0);
    paintScore();
    persist();
  });
  reveal.addEventListener('click', () => {
    inputs.forEach((input, i) => {
      input.value = blanks[i]!.answer;
      input.classList.remove('block-cloze__blank--incorrect');
      input.classList.add('block-cloze__blank--correct');
    });
    revealed = true;
    scoreValue = blanks.length;
    paintScore();
    persist();
  });
  reset.addEventListener('click', () => {
    inputs.forEach((input) => {
      input.value = '';
      input.classList.remove('block-cloze__blank--correct', 'block-cloze__blank--incorrect');
    });
    revealed = false;
    scoreValue = null;
    bankWords = shuffledOutOfSourceOrder(blanks.map((blank) => blank.answer));
    paintBank();
    paintScore();
    persist();
  });

  const controls = document.createElement('div');
  controls.className = 'block-cloze__controls';
  controls.append(check, reveal, reset);
  const printSummary = document.createElement('p');
  printSummary.className = 'block-cloze__print';
  printSummary.setAttribute('aria-hidden', 'true');
  for (const segment of segments) {
    if (segment.type === 'text') {
      printSummary.append(document.createTextNode(segment.value));
    } else {
      const blank = document.createElement('span');
      blank.className = 'block-cloze__print-blank';
      blank.textContent = segment.blank.answer;
      printSummary.append(blank);
    }
  }
  root.append(sentence, bank, controls, score, printSummary);
  paintBank();
  paintScore();
  return wrapBlock(root, block, mode);
}

export function renderSelfCheckBlock(
  block: Extract<Block, { block_type: 'self_check' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-self-check block-self-check--${block.content.mode}`;

  if (block.content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-self-check__title';
    title.textContent = block.content.title;
    root.append(title);
  }
  const prompt = document.createElement('p');
  prompt.className = 'block-self-check__prompt';
  prompt.textContent = block.content.prompt;
  root.append(prompt);

  if (mode === 'teacher') {
    if (block.content.mode === 'checklist') {
      const list = document.createElement('ul');
      list.className = 'block-self-check__preview-list';
      for (const item of block.content.items ?? []) {
        const li = document.createElement('li');
        li.textContent = item.label;
        list.append(li);
      }
      root.append(list);
    } else if (block.content.answer) {
      const hidden = document.createElement('p');
      hidden.className = 'block-self-check__answer-hidden';
      hidden.textContent = 'Answer hidden';
      root.append(hidden);
    }
    return wrapBlock(root, block, mode);
  }

  const key = storageKey('local', block.id);
  const printSummary = document.createElement('div');
  printSummary.className = 'block-self-check__print';
  printSummary.setAttribute('aria-hidden', 'true');
  const printPrompt = document.createElement('p');
  printPrompt.textContent = block.content.prompt;
  printSummary.append(printPrompt);
  if (block.content.mode === 'checklist') {
    const printList = document.createElement('ul');
    for (const item of block.content.items ?? []) {
      const entry = document.createElement('li');
      entry.textContent = item.label;
      printList.append(entry);
    }
    printSummary.append(printList);
  } else {
    const printAnswer = document.createElement('p');
    printAnswer.textContent = block.content.answer ?? '';
    printSummary.append(printAnswer);
  }

  if (block.content.mode === 'checklist') {
    type ChecklistState = { checkedIds: string[] };
    const validIds = new Set((block.content.items ?? []).map((item) => item.id));
    const rawSaved = objectValue(loadActivityState<unknown>(key));
    const checkedIds =
      rawSaved &&
      Array.isArray(rawSaved.checkedIds) &&
      rawSaved.checkedIds.every((id): id is string => typeof id === 'string')
        ? rawSaved.checkedIds.filter((id) => validIds.has(id))
        : [];
    const checked = new Set(checkedIds);
    const list = document.createElement('div');
    list.className = 'block-self-check__checklist';
    for (const item of block.content.items ?? []) {
      const label = document.createElement('label');
      label.className = 'block-self-check__checklist-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'block-self-check__checkbox';
      checkbox.checked = checked.has(item.id);
      checkbox.addEventListener('click', () => {
        if (checkbox.checked) checked.add(item.id);
        else checked.delete(item.id);
        saveActivityState(key, { checkedIds: [...checked] } satisfies ChecklistState);
      });
      label.append(checkbox, document.createTextNode(item.label));
      list.append(label);
    }
    root.append(list, printSummary);
    return wrapBlock(root, block, mode);
  }

  type AnswerState = { revealed: boolean; rating?: number };
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  let rating =
    typeof rawSaved?.rating === 'number' &&
    Number.isInteger(rawSaved.rating) &&
    rawSaved.rating >= 1 &&
    rawSaved.rating <= 5
      ? rawSaved.rating
      : undefined;
  let revealed =
    rawSaved?.revealed === true && (block.content.mode === 'reveal' || rating !== undefined);
  const answer = document.createElement('div');
  answer.className = 'block-self-check__answer';
  answer.textContent = block.content.answer ?? '';

  function paintAnswer(): void {
    answer.hidden = !revealed;
  }

  if (block.content.mode === 'reveal') {
    const toggle = activityButton(revealed ? 'Hide answer' : 'Show answer', 'block-self-check__btn');
    toggle.addEventListener('click', () => {
      revealed = !revealed;
      toggle.textContent = revealed ? 'Hide answer' : 'Show answer';
      paintAnswer();
      saveActivityState(key, { revealed } satisfies AnswerState);
    });
    root.append(toggle, answer);
  } else {
    const scale = document.createElement('div');
    scale.className = 'block-self-check__confidence';
    scale.setAttribute('aria-label', 'Confidence from 1 to 5');
    for (let value = 1; value <= 5; value += 1) {
      const button = activityButton(String(value), 'block-self-check__confidence-btn');
      button.dataset.rating = String(value);
      button.setAttribute('aria-pressed', rating === value ? 'true' : 'false');
      button.addEventListener('click', () => {
        rating = value;
        revealed = true;
        [...scale.children].forEach((child) =>
          child.setAttribute(
            'aria-pressed',
            (child as HTMLButtonElement).dataset.rating === String(value) ? 'true' : 'false'
          )
        );
        paintAnswer();
        saveActivityState(key, { rating, revealed } satisfies AnswerState);
      });
      scale.append(button);
    }
    root.append(scale, answer);
  }
  root.append(printSummary);
  paintAnswer();
  return wrapBlock(root, block, mode);
}

const MAP_VIEW_W = 400;
const MAP_VIEW_H = 240;
const MAP_NODE_R = 28;

function buildMindMapSvg(content: MindMapContent): string {
  const positioned = layoutMindMap(content.nodes);
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const lines: string[] = [];
  for (const node of content.nodes) {
    if (node.parent_id == null) continue;
    const child = byId.get(node.id);
    const parent = byId.get(node.parent_id);
    if (!child || !parent) continue;
    lines.push(
      `<line x1="${parent.x}" y1="${parent.y}" x2="${child.x}" y2="${child.y}" stroke="#64748b" stroke-width="1.5" />`
    );
  }
  const nodesMarkup = positioned
    .map(
      (node) =>
        `<circle cx="${node.x}" cy="${node.y}" r="${MAP_NODE_R}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />` +
        `<text x="${node.x}" y="${node.y}" text-anchor="middle" dominant-baseline="middle" font-size="12">${escapeXml(node.label)}</text>`
    )
    .join('');
  const title = content.title?.trim()
    ? `<text x="${MAP_VIEW_W / 2}" y="18" text-anchor="middle" font-size="14">${escapeXml(content.title.trim())}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_VIEW_W} ${MAP_VIEW_H}" width="100%" role="img">${title}${lines.join('')}${nodesMarkup}</svg>`;
}

function buildConceptMapSvg(content: ConceptMapContent): string {
  const layout = layoutConceptMap(content.nodes, content.edges);
  const edgesMarkup = layout.edges
    .map((edge) => {
      const midX = (edge.x1 + edge.x2) / 2;
      const midY = (edge.y1 + edge.y2) / 2;
      const label = edge.label
        ? `<text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="11">${escapeXml(edge.label)}</text>`
        : '';
      return (
        `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="#64748b" stroke-width="1.5" />` +
        label
      );
    })
    .join('');
  const nodesMarkup = layout.nodes
    .map(
      (node) =>
        `<circle cx="${node.x}" cy="${node.y}" r="${MAP_NODE_R}" fill="#fef3c7" stroke="#d97706" stroke-width="1.5" />` +
        `<text x="${node.x}" y="${node.y}" text-anchor="middle" dominant-baseline="middle" font-size="12">${escapeXml(node.label)}</text>`
    )
    .join('');
  const title = content.title?.trim()
    ? `<text x="${MAP_VIEW_W / 2}" y="18" text-anchor="middle" font-size="14">${escapeXml(content.title.trim())}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_VIEW_W} ${MAP_VIEW_H}" width="100%" role="img">${title}${edgesMarkup}${nodesMarkup}</svg>`;
}

export function renderChartBlock(
  block: Extract<Block, { block_type: 'chart' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-chart';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-chart__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-chart__svg';
  wrap.innerHTML = buildChartSvg(block.content);
  root.append(wrap);

  const details = document.createElement('details');
  details.className = 'block-chart__data';
  const summary = document.createElement('summary');
  summary.textContent = 'Chart data';
  const table = document.createElement('table');
  table.className = 'block-chart__table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Series', 'X', 'Y']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  for (const row of buildChartTableRows(block.content)) {
    const tr = document.createElement('tr');
    for (const value of [row.series, row.x, row.y]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  details.append(summary, table);
  root.append(details);

  return wrapBlock(root, block, mode);
}

export function renderEquationBlock(
  block: Extract<Block, { block_type: 'equation' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-equation';

  const math = document.createElement('div');
  math.className = 'block-equation__math';
  const latex = block.content.latex ?? '';
  if (!latex.trim()) {
    math.textContent = '';
  } else {
    try {
      katex.render(latex, math, { throwOnError: false, displayMode: true });
    } catch {
      math.textContent = latex;
      math.classList.add('block-equation__math--error');
    }
  }
  root.append(math);

  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-equation__caption';
    cap.textContent = block.content.caption;
    root.append(cap);
  }

  return wrapBlock(root, block, mode);
}

export function renderDiagramBlock(
  block: Extract<Block, { block_type: 'diagram' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-diagram';

  if (block.content.source === 'image') {
    const url = block.content.image_url ?? '';
    if (isHttpUrl(url)) {
      const img = document.createElement('img');
      img.className = 'block-diagram__image';
      img.src = url;
      img.alt = block.content.image_alt ?? '';
      img.loading = 'lazy';
      root.append(img);
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'block-diagram__unavailable';
      unavailable.textContent = (block.content.image_alt ?? '').trim() || 'Image unavailable.';
      root.append(unavailable);
    }
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'block-diagram__svg';
    wrap.innerHTML = sanitizeSvgMarkup(block.content.svg_markup ?? '');
    root.append(wrap);
  }

  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-diagram__caption';
    cap.textContent = block.content.caption;
    root.append(cap);
  }

  return wrapBlock(root, block, mode);
}

export function renderMindMapBlock(
  block: Extract<Block, { block_type: 'mind_map' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-mind-map';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-mind-map__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-mind-map__svg';
  wrap.innerHTML = buildMindMapSvg(block.content);
  root.append(wrap);

  return wrapBlock(root, block, mode);
}

export function renderConceptMapBlock(
  block: Extract<Block, { block_type: 'concept_map' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-concept-map';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-concept-map__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-concept-map__svg';
  wrap.innerHTML = buildConceptMapSvg(block.content);
  root.append(wrap);

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
    case 'gallery':
      return renderGalleryBlock(block, mode);
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
    case 'flashcards':
      return renderFlashcardsBlock(block, mode);
    case 'cloze':
      return renderClozeBlock(block, mode);
    case 'self_check':
      return renderSelfCheckBlock(block, mode);
    case 'timeline':
      return renderTimelineBlock(block, mode);
    case 'collection':
      return renderCollectionBlock(block, mode);
    case 'spacer':
      return renderSpacerBlock(block, mode);
    case 'section':
      return renderSectionBlock(block, mode);
    case 'columns':
      return renderColumnsBlock(block, mode);
    case 'tabs':
      return renderTabsBlock(block, mode);
    case 'chart':
      return renderChartBlock(block, mode);
    case 'equation':
      return renderEquationBlock(block, mode);
    case 'diagram':
      return renderDiagramBlock(block, mode);
    case 'mind_map':
      return renderMindMapBlock(block, mode);
    case 'concept_map':
      return renderConceptMapBlock(block, mode);
  }
}
