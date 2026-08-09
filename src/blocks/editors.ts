import { parseVideoInput } from '@/blocks/video-url';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor,
  createTabsEditor
} from '@/blocks/layout-editors';
import type { Block } from '@/schemas/block';

export type BlockChangeHandler<T extends Block = Block> = (block: T) => void;

const VISIBILITY_OPTIONS = [
  { value: 'student_teacher', label: 'Students & teacher' },
  { value: 'teacher_only', label: 'Teacher only' }
] as const;

const MEDIA_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }
] as const;

export function createVisibilitySelect<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>,
  getLatest: () => T = () => block
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'block-editor__visibility';
  select.setAttribute('aria-label', 'Visibility');

  for (const option of VISIBILITY_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = block.visibility === option.value;
    select.append(opt);
  }

  select.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      visibility: select.value as Block['visibility']
    });
  });

  return select;
}

function createMediaSizeSelect(
  selected: 'small' | 'medium' | 'large',
  onChange: () => void
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'block-editor__media-size';
  select.setAttribute('aria-label', 'Size');

  for (const option of MEDIA_SIZE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = selected === option.value;
    select.append(opt);
  }

  select.addEventListener('change', onChange);
  return select;
}

export function editorShell<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>,
  fields: HTMLElement,
  getLatest: () => T = () => block
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'block-editor';
  shell.dataset.blockId = block.id;
  shell.dataset.blockType = block.block_type;
  shell.append(createVisibilitySelect(block, onChange, getLatest), fields);
  return shell;
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);

  if (start === end) {
    const insert = `${before}${after}`;
    textarea.value = value.slice(0, start) + insert + value.slice(end);
    const cursor = start + before.length;
    textarea.setSelectionRange(cursor, cursor);
  } else {
    textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
    textarea.setSelectionRange(start, start + before.length + selected.length + after.length);
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

function insertAroundOrAppend(textarea: HTMLTextAreaElement, open: string, close: string): void {
  wrapSelection(textarea, open, close);
}

function createRichTextToolbar(textarea: HTMLTextAreaElement): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'block-editor__toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting');

  const actions: Array<{ label: string; run: () => void }> = [
    {
      label: 'Bold',
      run: () => insertAroundOrAppend(textarea, '<strong>', '</strong>')
    },
    {
      label: 'Italic',
      run: () => insertAroundOrAppend(textarea, '<em>', '</em>')
    },
    {
      label: 'Bullet list',
      run: () => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end).trim();
        if (selected) {
          const items = selected
            .split(/\n+/)
            .map((line) => `  <li>${line}</li>`)
            .join('\n');
          wrapSelection(textarea, `<ul>\n${items}\n</ul>`, '');
        } else {
          wrapSelection(textarea, '<ul>\n  <li>', '</li>\n</ul>');
        }
      }
    },
    {
      label: 'Numbered list',
      run: () => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end).trim();
        if (selected) {
          const items = selected
            .split(/\n+/)
            .map((line) => `  <li>${line}</li>`)
            .join('\n');
          wrapSelection(textarea, `<ol>\n${items}\n</ol>`, '');
        } else {
          wrapSelection(textarea, '<ol>\n  <li>', '</li>\n</ol>');
        }
      }
    }
  ];

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost block-editor__toolbar-btn';
    button.textContent = action.label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      action.run();
    });
    toolbar.append(button);
  }

  return toolbar;
}

export function createRichTextEditor(
  block: Extract<Block, { block_type: 'rich_text' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'rich_text' }>>,
  getLatest: () => Extract<Block, { block_type: 'rich_text' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 6;
  textarea.setAttribute('aria-label', 'Rich text HTML');

  const toolbar = createRichTextToolbar(textarea);

  textarea.addEventListener('input', () => {
    onChange({
      ...getLatest(),
      content: { html: textarea.value }
    });
  });

  fields.append(toolbar, textarea);
  return editorShell(block, onChange, fields, getLatest);
}

export function createHeadingEditor(
  block: Extract<Block, { block_type: 'heading' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'heading' }>>,
  getLatest: () => Extract<Block, { block_type: 'heading' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'block-editor__heading-text';
  textInput.value = block.content.text;
  textInput.setAttribute('aria-label', 'Heading text');

  const variantSelect = document.createElement('select');
  variantSelect.className = 'block-editor__heading-variant';
  variantSelect.setAttribute('aria-label', 'Heading level');

  for (const variant of ['page', 'section', 'subsection'] as const) {
    const opt = document.createElement('option');
    opt.value = variant;
    opt.textContent = variant;
    opt.selected = block.variant === variant;
    variantSelect.append(opt);
  }

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: variantSelect.value as typeof block.variant,
      content: { text: textInput.value }
    });
  };

  textInput.addEventListener('input', emitChange);
  variantSelect.addEventListener('change', emitChange);

  fields.append(textInput, variantSelect);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCalloutEditor(
  block: Extract<Block, { block_type: 'callout' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'callout' }>>,
  getLatest: () => Extract<Block, { block_type: 'callout' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const styleSelect = document.createElement('select');
  styleSelect.className = 'block-editor__callout-style';
  styleSelect.setAttribute('aria-label', 'Callout style');

  for (const style of [
    'information',
    'important',
    'warning',
    'extension',
    'scaffold',
    'example',
    'remember',
    'teacher'
  ] as const) {
    const opt = document.createElement('option');
    opt.value = style;
    opt.textContent = style;
    opt.selected = block.content.style === style;
    styleSelect.append(opt);
  }

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'block-editor__callout-title';
  titleInput.value = block.content.title ?? '';
  titleInput.setAttribute('aria-label', 'Callout title');

  const bodyInput = document.createElement('textarea');
  bodyInput.className = 'block-editor__callout-body';
  bodyInput.value = block.content.body;
  bodyInput.rows = 4;
  bodyInput.setAttribute('aria-label', 'Callout body');

  const emitChange = () => {
    const title = titleInput.value.trim();
    onChange({
      ...getLatest(),
      content: {
        style: styleSelect.value as typeof block.content.style,
        title: title.length > 0 ? title : undefined,
        body: bodyInput.value
      }
    });
  };

  styleSelect.addEventListener('change', emitChange);
  titleInput.addEventListener('input', emitChange);
  bodyInput.addEventListener('input', emitChange);

  fields.append(styleSelect, titleInput, bodyInput);
  return editorShell(block, onChange, fields, getLatest);
}

export function createImageEditor(
  block: Extract<Block, { block_type: 'image' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'image' }>>,
  getLatest: () => Extract<Block, { block_type: 'image' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__image-url';
  url.value = block.content.url;
  url.placeholder = 'Image URL (https://…)';
  url.setAttribute('aria-label', 'Image URL');

  const alt = document.createElement('input');
  alt.type = 'text';
  alt.className = 'block-editor__image-alt';
  alt.value = block.content.alt_text;
  alt.placeholder = 'Alt text (required to publish)';
  alt.setAttribute('aria-label', 'Alt text');

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__image-caption';
  caption.value = block.content.caption ?? '';
  caption.placeholder = 'Caption (optional)';
  caption.setAttribute('aria-label', 'Caption');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: sizeSelect.value as typeof block.variant,
      content: {
        url: url.value,
        alt_text: alt.value,
        caption: caption.value || undefined
      }
    });
  };

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  url.addEventListener('input', emitChange);
  alt.addEventListener('input', emitChange);
  caption.addEventListener('input', emitChange);

  fields.append(url, alt, caption, sizeSelect);
  return editorShell(block, onChange, fields, getLatest);
}

export function createVideoEditor(
  block: Extract<Block, { block_type: 'video' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'video' }>>,
  getLatest: () => Extract<Block, { block_type: 'video' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'text';
  url.className = 'block-editor__video-url';
  url.value = block.content.url ?? block.content.external_id;
  url.placeholder = 'YouTube or Vimeo URL';
  url.setAttribute('aria-label', 'Video URL');

  const status = document.createElement('p');
  status.className = 'block-editor__hint';
  status.textContent = block.content.external_id
    ? `${block.content.provider}: ${block.content.external_id}`
    : 'Paste a YouTube or Vimeo link';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__video-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Video title');

  const emitChange = () => {
    const parsed = parseVideoInput(url.value);
    if (parsed) {
      status.textContent = `${parsed.provider}: ${parsed.external_id}`;
      onChange({
        ...getLatest(),
        variant: sizeSelect.value as typeof block.variant,
        content: {
          ...block.content,
          provider: parsed.provider,
          external_id: parsed.external_id,
          url: url.value,
          title: title.value || undefined
        }
      });
    } else {
      status.textContent = 'Unrecognised video link';
      onChange({
        ...getLatest(),
        variant: sizeSelect.value as typeof block.variant,
        content: {
          ...block.content,
          external_id: '',
          url: url.value,
          title: title.value || undefined
        }
      });
    }
  };

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(url, status, title, sizeSelect);
  return editorShell(block, onChange, fields, getLatest);
}

export function createEmbedEditor(
  block: Extract<Block, { block_type: 'embed' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'embed' }>>,
  getLatest: () => Extract<Block, { block_type: 'embed' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__embed-url';
  url.value = block.content.url;
  url.setAttribute('aria-label', 'Embed URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__embed-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Embed title');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        ...block.content,
        url: url.value,
        title: title.value || undefined
      }
    });
  };

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(url, title);
  return editorShell(block, onChange, fields, getLatest);
}

export function createHtmlEditor(
  block: Extract<Block, { block_type: 'html' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'html' }>>,
  getLatest: () => Extract<Block, { block_type: 'html' }> = () => block
): HTMLElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 8;
  textarea.setAttribute('aria-label', 'HTML');
  textarea.addEventListener('input', () => {
    onChange({ ...getLatest(), content: { html: textarea.value } });
  });
  return editorShell(block, onChange, textarea, getLatest);
}

export function createQuoteEditor(
  block: Extract<Block, { block_type: 'quote' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'quote' }>>,
  getLatest: () => Extract<Block, { block_type: 'quote' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const quote = document.createElement('textarea');
  quote.className = 'block-editor__quote-text';
  quote.value = block.content.quote;
  quote.rows = 3;
  quote.setAttribute('aria-label', 'Quote');

  const attribution = document.createElement('input');
  attribution.type = 'text';
  attribution.className = 'block-editor__quote-attribution';
  attribution.value = block.content.attribution ?? '';
  attribution.placeholder = 'Attribution (optional)';
  attribution.setAttribute('aria-label', 'Attribution');

  const source = document.createElement('input');
  source.type = 'text';
  source.className = 'block-editor__quote-source';
  source.value = block.content.source ?? '';
  source.placeholder = 'Source (optional)';
  source.setAttribute('aria-label', 'Source');

  const reference = document.createElement('input');
  reference.type = 'text';
  reference.className = 'block-editor__quote-reference';
  reference.value = block.content.reference ?? '';
  reference.placeholder = 'Reference (optional)';
  reference.setAttribute('aria-label', 'Reference');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        quote: quote.value,
        attribution: attribution.value.trim() || undefined,
        source: source.value.trim() || undefined,
        reference: reference.value.trim() || undefined
      }
    });
  };

  quote.addEventListener('input', emitChange);
  attribution.addEventListener('input', emitChange);
  source.addEventListener('input', emitChange);
  reference.addEventListener('input', emitChange);

  fields.append(quote, attribution, source, reference);
  return editorShell(block, onChange, fields, getLatest);
}

export function createDividerEditor(
  block: Extract<Block, { block_type: 'divider' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'divider' }>>,
  getLatest: () => Extract<Block, { block_type: 'divider' }> = () => block
): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Divider — no extra fields.';
  return editorShell(block, onChange, hint, getLatest);
}

export function createDefinitionEditor(
  block: Extract<Block, { block_type: 'definition' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'definition' }>>,
  getLatest: () => Extract<Block, { block_type: 'definition' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const term = document.createElement('input');
  term.type = 'text';
  term.className = 'block-editor__definition-term';
  term.value = block.content.term;
  term.placeholder = 'Term';
  term.setAttribute('aria-label', 'Term');

  const definition = document.createElement('textarea');
  definition.className = 'block-editor__definition-body';
  definition.value = block.content.definition;
  definition.rows = 3;
  definition.placeholder = 'Definition';
  definition.setAttribute('aria-label', 'Definition');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        term: term.value,
        definition: definition.value
      }
    });
  };

  term.addEventListener('input', emitChange);
  definition.addEventListener('input', emitChange);

  fields.append(term, definition);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCodeEditor(
  block: Extract<Block, { block_type: 'code' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'code' }>>,
  getLatest: () => Extract<Block, { block_type: 'code' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const language = document.createElement('input');
  language.type = 'text';
  language.className = 'block-editor__code-language';
  language.value = block.content.language ?? '';
  language.placeholder = 'Language (optional)';
  language.setAttribute('aria-label', 'Language');

  const code = document.createElement('textarea');
  code.className = 'block-editor__code';
  code.value = block.content.code;
  code.rows = 8;
  code.setAttribute('aria-label', 'Code');
  code.spellcheck = false;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        code: code.value,
        language: language.value.trim() || undefined
      }
    });
  };

  language.addEventListener('input', emitChange);
  code.addEventListener('input', emitChange);

  fields.append(language, code);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAudioEditor(
  block: Extract<Block, { block_type: 'audio' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'audio' }>>,
  getLatest: () => Extract<Block, { block_type: 'audio' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__audio-url';
  url.value = block.content.url;
  url.placeholder = 'Audio URL (https://…)';
  url.setAttribute('aria-label', 'Audio URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__audio-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Audio title');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        url: url.value,
        title: title.value.trim() || undefined
      }
    });
  };

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(url, title);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAttachmentEditor(
  block: Extract<Block, { block_type: 'attachment' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'attachment' }>>,
  getLatest: () => Extract<Block, { block_type: 'attachment' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__attachment-url';
  url.value = block.content.url;
  url.placeholder = 'File URL (https://…)';
  url.setAttribute('aria-label', 'Attachment URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__attachment-title';
  title.value = block.content.title;
  title.placeholder = 'Title';
  title.setAttribute('aria-label', 'Attachment title');

  const filename = document.createElement('input');
  filename.type = 'text';
  filename.className = 'block-editor__attachment-filename';
  filename.value = block.content.filename ?? '';
  filename.placeholder = 'Filename (optional)';
  filename.setAttribute('aria-label', 'Filename');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        url: url.value,
        title: title.value,
        filename: filename.value.trim() || undefined
      }
    });
  };

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);
  filename.addEventListener('input', emitChange);

  fields.append(url, title, filename);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAccordionEditor(
  block: Extract<Block, { block_type: 'accordion' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'accordion' }>>,
  getLatest: () => Extract<Block, { block_type: 'accordion' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__accordion-items';

  let items = block.content.items.map((item) => ({ ...item }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: { items: items.map((item) => ({ title: item.title, body: item.body })) }
    });
  };

  function renderItems(): void {
    itemsContainer.replaceChildren();

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__accordion-item';

      const title = document.createElement('input');
      title.type = 'text';
      title.className = 'block-editor__accordion-title';
      title.value = item.title;
      title.placeholder = 'Section title';
      title.setAttribute('aria-label', `Accordion item ${index + 1} title`);

      const body = document.createElement('textarea');
      body.className = 'block-editor__accordion-body';
      body.value = item.body;
      body.rows = 3;
      body.placeholder = 'Section body';
      body.setAttribute('aria-label', `Accordion item ${index + 1} body`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__accordion-remove';
      remove.textContent = 'Remove';
      remove.disabled = items.length <= 1;
      remove.addEventListener('click', () => {
        items = items.filter((_, i) => i !== index);
        if (items.length === 0) {
          items = [{ title: '', body: '' }];
        }
        emitChange();
        renderItems();
      });

      title.addEventListener('input', () => {
        items[index] = { ...items[index]!, title: title.value };
        emitChange();
      });
      body.addEventListener('input', () => {
        items[index] = { ...items[index]!, body: body.value };
        emitChange();
      });

      row.append(title, body, remove);
      itemsContainer.append(row);
    });
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__accordion-add';
  addButton.textContent = 'Add item';
  addButton.addEventListener('click', () => {
    items = [...items, { title: '', body: '' }];
    emitChange();
    renderItems();
  });

  renderItems();
  fields.append(itemsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

export function createTableEditor(
  block: Extract<Block, { block_type: 'table' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'table' }>>,
  getLatest: () => Extract<Block, { block_type: 'table' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let headers = [...block.content.headers];
  let rows = block.content.rows.map((row) => [...row]);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'block-editor__table-wrap';

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        headers: [...headers],
        rows: rows.map((row) => [...row])
      }
    });
  };

  function ensureRowWidth(row: string[]): string[] {
    while (row.length < headers.length) row.push('');
    if (row.length > headers.length) row.length = headers.length;
    return row;
  }

  function renderTable(): void {
    tableWrap.replaceChildren();

    const headerRow = document.createElement('div');
    headerRow.className = 'block-editor__table-header-row';

    headers.forEach((header, colIndex) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'block-editor__table-header';
      input.value = header;
      input.setAttribute('aria-label', `Column ${colIndex + 1} header`);
      input.addEventListener('input', () => {
        headers[colIndex] = input.value;
        emitChange();
      });
      headerRow.append(input);
    });
    tableWrap.append(headerRow);

    rows.forEach((row, rowIndex) => {
      ensureRowWidth(row);
      const rowEl = document.createElement('div');
      rowEl.className = 'block-editor__table-row';

      row.forEach((cell, colIndex) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'block-editor__table-cell';
        input.value = cell;
        input.setAttribute('aria-label', `Row ${rowIndex + 1} column ${colIndex + 1}`);
        input.addEventListener('input', () => {
          rows[rowIndex]![colIndex] = input.value;
          emitChange();
        });
        rowEl.append(input);
      });

      tableWrap.append(rowEl);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'block-editor__table-actions';

  const addRow = document.createElement('button');
  addRow.type = 'button';
  addRow.className = 'btn btn--secondary';
  addRow.textContent = 'Add row';
  addRow.addEventListener('click', () => {
    rows = [...rows, Array.from({ length: headers.length }, () => '')];
    emitChange();
    renderTable();
  });

  const addCol = document.createElement('button');
  addCol.type = 'button';
  addCol.className = 'btn btn--secondary';
  addCol.textContent = 'Add column';
  addCol.addEventListener('click', () => {
    headers = [...headers, `Column ${headers.length + 1}`];
    rows = rows.map((row) => [...ensureRowWidth(row), '']);
    emitChange();
    renderTable();
  });

  actions.append(addRow, addCol);
  renderTable();
  fields.append(tableWrap, actions);
  return editorShell(block, onChange, fields, getLatest);
}

export function createQuestionSetEditor(
  block: Extract<Block, { block_type: 'question_set' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'question_set' }>>,
  getLatest: () => Extract<Block, { block_type: 'question_set' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__question-set-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Set title (optional)';
  title.setAttribute('aria-label', 'Question set title');

  const questionsContainer = document.createElement('div');
  questionsContainer.className = 'block-editor__questions';

  let questions = block.content.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    options: q.options ? [...q.options] : undefined as string[] | undefined
  }));
  let questionCounter = questions.length;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        title: title.value.trim() || undefined,
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          options: q.kind === 'multiple_choice' ? [...(q.options ?? [])] : undefined
        }))
      }
    });
  };

  function renderQuestions(): void {
    questionsContainer.replaceChildren();

    questions.forEach((question, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__question';

      const prompt = document.createElement('textarea');
      prompt.className = 'block-editor__question-prompt';
      prompt.value = question.prompt;
      prompt.rows = 2;
      prompt.placeholder = 'Prompt';
      prompt.setAttribute('aria-label', `Question ${index + 1} prompt`);

      const kind = document.createElement('select');
      kind.className = 'block-editor__question-kind';
      kind.setAttribute('aria-label', `Question ${index + 1} kind`);
      for (const value of ['short_answer', 'multiple_choice'] as const) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value === 'short_answer' ? 'Short answer' : 'Multiple choice';
        opt.selected = question.kind === value;
        kind.append(opt);
      }

      const options = document.createElement('textarea');
      options.className = 'block-editor__question-options';
      options.rows = 3;
      options.placeholder = 'Options (one per line)';
      options.value = (question.options ?? []).join('\n');
      options.hidden = question.kind !== 'multiple_choice';
      options.setAttribute('aria-label', `Question ${index + 1} options`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost';
      remove.textContent = 'Remove';
      remove.disabled = questions.length <= 1;
      remove.addEventListener('click', () => {
        questions = questions.filter((_, i) => i !== index);
        if (questions.length === 0) {
          questionCounter += 1;
          questions = [
            {
              id: `q_${questionCounter}`,
              prompt: '',
              kind: 'short_answer' as const,
              options: undefined
            }
          ];
        }
        emitChange();
        renderQuestions();
      });

      prompt.addEventListener('input', () => {
        questions[index] = { ...questions[index]!, prompt: prompt.value };
        emitChange();
      });

      kind.addEventListener('change', () => {
        const nextKind = kind.value as 'short_answer' | 'multiple_choice';
        questions[index] = {
          ...questions[index]!,
          kind: nextKind,
          options:
            nextKind === 'multiple_choice'
              ? options.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
              : undefined
        };
        options.hidden = nextKind !== 'multiple_choice';
        emitChange();
      });

      options.addEventListener('input', () => {
        questions[index] = {
          ...questions[index]!,
          options: options.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        };
        emitChange();
      });

      row.append(prompt, kind, options, remove);
      questionsContainer.append(row);
    });
  }

  title.addEventListener('input', emitChange);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary';
  addButton.textContent = 'Add question';
  addButton.addEventListener('click', () => {
    questionCounter += 1;
    questions = [
      ...questions,
      {
        id: `q_${questionCounter}`,
        prompt: '',
        kind: 'short_answer' as const,
        options: undefined
      }
    ];
    emitChange();
    renderQuestions();
  });

  renderQuestions();
  fields.append(title, questionsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

export function createGalleryEditor(
  block: Extract<Block, { block_type: 'gallery' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'gallery' }>>,
  getLatest: () => Extract<Block, { block_type: 'gallery' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let layout = block.content.layout;
  let items = block.content.items.map((entry) => ({ ...entry }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: sizeSelect.value as typeof block.variant,
      content: {
        layout,
        items: items.map((entry) => ({
          id: entry.id,
          url: entry.url,
          alt_text: entry.alt_text,
          ...(entry.caption ? { caption: entry.caption } : {})
        }))
      }
    });
  };

  const layoutSelect = document.createElement('select');
  layoutSelect.className = 'block-editor__gallery-layout';
  layoutSelect.setAttribute('aria-label', 'Gallery layout');
  for (const [value, label] of [
    ['grid', 'Grid'],
    ['carousel', 'Carousel'],
    ['comparison', 'Comparison']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    layoutSelect.append(opt);
  }
  layoutSelect.value = layout;

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__gallery-items';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__gallery-add';
  addButton.textContent = 'Add image';

  function emptyItem(id: string) {
    return { id, url: '', alt_text: '', caption: undefined as string | undefined };
  }

  function renderItems(): void {
    itemsContainer.replaceChildren();
    const comparison = layout === 'comparison';
    const atMin = items.length <= 2;
    const atMax = items.length >= 12;

    items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__gallery-item';

      const url = document.createElement('input');
      url.type = 'url';
      url.className = 'block-editor__gallery-url';
      url.value = entry.url;
      url.placeholder = 'Image URL (https://…)';
      url.setAttribute('aria-label', `Gallery image ${index + 1} URL`);

      const alt = document.createElement('input');
      alt.type = 'text';
      alt.className = 'block-editor__gallery-alt';
      alt.value = entry.alt_text;
      alt.placeholder = 'Alt text (required to publish)';
      alt.setAttribute('aria-label', `Gallery image ${index + 1} alt text`);

      const caption = document.createElement('input');
      caption.type = 'text';
      caption.className = 'block-editor__gallery-caption';
      caption.value = entry.caption ?? '';
      caption.placeholder = 'Caption (optional)';
      caption.setAttribute('aria-label', `Gallery image ${index + 1} caption`);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__gallery-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...items];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__gallery-down';
      down.textContent = 'Down';
      down.disabled = index === items.length - 1;
      down.addEventListener('click', () => {
        if (index >= items.length - 1) return;
        const next = [...items];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__gallery-remove';
      remove.textContent = 'Remove';
      remove.disabled = comparison || atMin;
      remove.addEventListener('click', () => {
        if (comparison || items.length <= 2) return;
        items = items.filter((_, i) => i !== index);
        emitChange();
        renderItems();
      });

      url.addEventListener('input', () => {
        items[index] = { ...items[index]!, url: url.value };
        emitChange();
      });
      alt.addEventListener('input', () => {
        items[index] = { ...items[index]!, alt_text: alt.value };
        emitChange();
      });
      caption.addEventListener('input', () => {
        items[index] = {
          ...items[index]!,
          caption: caption.value || undefined
        };
        emitChange();
      });

      row.append(url, alt, caption, up, down, remove);
      itemsContainer.append(row);
    });

    if (comparison) {
      addButton.remove();
    } else if (!addButton.isConnected) {
      fields.append(addButton);
    }
    addButton.disabled = atMax;
  }

  layoutSelect.addEventListener('change', () => {
    layout = layoutSelect.value as typeof layout;
    if (layout === 'comparison' && items.length > 2) {
      items = items.slice(0, 2);
    }
    while (layout === 'comparison' && items.length < 2) {
      items = [...items, emptyItem(`${getLatest().id}_i${items.length + 1}`)];
    }
    emitChange();
    renderItems();
  });

  addButton.addEventListener('click', () => {
    if (layout === 'comparison' || items.length >= 12) return;
    const id = `${getLatest().id}_i${Date.now()}`;
    items = [...items, emptyItem(id)];
    emitChange();
    renderItems();
  });

  fields.append(layoutSelect, sizeSelect, itemsContainer, addButton);
  renderItems();
  return editorShell(block, onChange, fields, getLatest);
}

export function createBlockEditor(
  block: Block,
  onChange: BlockChangeHandler,
  getLatest?: () => Block
): HTMLElement {
  const latest = (getLatest ?? (() => block)) as () => Block;
  switch (block.block_type) {
    case 'rich_text':
      return createRichTextEditor(block, onChange, latest as () => Extract<Block, { block_type: 'rich_text' }>);
    case 'heading':
      return createHeadingEditor(block, onChange, latest as () => Extract<Block, { block_type: 'heading' }>);
    case 'callout':
      return createCalloutEditor(block, onChange, latest as () => Extract<Block, { block_type: 'callout' }>);
    case 'image':
      return createImageEditor(block, onChange, latest as () => Extract<Block, { block_type: 'image' }>);
    case 'video':
      return createVideoEditor(block, onChange, latest as () => Extract<Block, { block_type: 'video' }>);
    case 'embed':
      return createEmbedEditor(block, onChange, latest as () => Extract<Block, { block_type: 'embed' }>);
    case 'html':
      return createHtmlEditor(block, onChange, latest as () => Extract<Block, { block_type: 'html' }>);
    case 'quote':
      return createQuoteEditor(block, onChange, latest as () => Extract<Block, { block_type: 'quote' }>);
    case 'divider':
      return createDividerEditor(block, onChange, latest as () => Extract<Block, { block_type: 'divider' }>);
    case 'definition':
      return createDefinitionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'definition' }>);
    case 'code':
      return createCodeEditor(block, onChange, latest as () => Extract<Block, { block_type: 'code' }>);
    case 'audio':
      return createAudioEditor(block, onChange, latest as () => Extract<Block, { block_type: 'audio' }>);
    case 'attachment':
      return createAttachmentEditor(block, onChange, latest as () => Extract<Block, { block_type: 'attachment' }>);
    case 'accordion':
      return createAccordionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'accordion' }>);
    case 'gallery':
      return createGalleryEditor(block, onChange, latest as () => Extract<Block, { block_type: 'gallery' }>);
    case 'table':
      return createTableEditor(block, onChange, latest as () => Extract<Block, { block_type: 'table' }>);
    case 'question_set':
      return createQuestionSetEditor(block, onChange, latest as () => Extract<Block, { block_type: 'question_set' }>);
    case 'spacer':
      return createSpacerEditor(block, onChange, latest as () => Extract<Block, { block_type: 'spacer' }>);
    case 'section':
      return createSectionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'section' }>);
    case 'columns':
      return createColumnsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'columns' }>);
    case 'tabs':
      return createTabsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'tabs' }>);
  }
}
