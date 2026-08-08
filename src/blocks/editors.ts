import { parseVideoInput } from '@/blocks/video-url';
import type { Block } from '@/schemas/block';

export type BlockChangeHandler<T extends Block = Block> = (block: T) => void;

const VISIBILITY_OPTIONS = [
  { value: 'student_teacher', label: 'Students & teacher' },
  { value: 'teacher_only', label: 'Teacher only' }
] as const;

export function createVisibilitySelect<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>
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
      ...block,
      visibility: select.value as Block['visibility']
    });
  });

  return select;
}

function editorShell<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>,
  fields: HTMLElement
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'block-editor';
  shell.dataset.blockId = block.id;
  shell.dataset.blockType = block.block_type;
  shell.append(createVisibilitySelect(block, onChange), fields);
  return shell;
}

export function createRichTextEditor(
  block: Extract<Block, { block_type: 'rich_text' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'rich_text' }>>
): HTMLElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 6;
  textarea.setAttribute('aria-label', 'Rich text HTML');

  textarea.addEventListener('input', () => {
    onChange({
      ...block,
      content: { html: textarea.value }
    });
  });

  return editorShell(block, onChange, textarea);
}

export function createHeadingEditor(
  block: Extract<Block, { block_type: 'heading' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'heading' }>>
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
      ...block,
      variant: variantSelect.value as typeof block.variant,
      content: { text: textInput.value }
    });
  };

  textInput.addEventListener('input', emitChange);
  variantSelect.addEventListener('change', emitChange);

  fields.append(textInput, variantSelect);
  return editorShell(block, onChange, fields);
}

export function createCalloutEditor(
  block: Extract<Block, { block_type: 'callout' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'callout' }>>
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
      ...block,
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
  return editorShell(block, onChange, fields);
}

export function createImageEditor(
  block: Extract<Block, { block_type: 'image' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'image' }>>
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__image-url';
  url.value = block.content.url;
  url.placeholder = 'https://…';
  url.setAttribute('aria-label', 'Image URL');
  url.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, url: url.value } });
  });

  const alt = document.createElement('input');
  alt.type = 'text';
  alt.className = 'block-editor__image-alt';
  alt.value = block.content.alt_text;
  alt.setAttribute('aria-label', 'Alt text');
  alt.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, alt_text: alt.value } });
  });

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__image-caption';
  caption.value = block.content.caption ?? '';
  caption.setAttribute('aria-label', 'Caption');
  caption.addEventListener('input', () => {
    onChange({
      ...block,
      content: { ...block.content, caption: caption.value || undefined }
    });
  });

  fields.append(url, alt, caption);
  return editorShell(block, onChange, fields);
}

export function createVideoEditor(
  block: Extract<Block, { block_type: 'video' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'video' }>>
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

  url.addEventListener('input', () => {
    const parsed = parseVideoInput(url.value);
    if (parsed) {
      status.textContent = `${parsed.provider}: ${parsed.external_id}`;
      onChange({
        ...block,
        content: {
          ...block.content,
          provider: parsed.provider,
          external_id: parsed.external_id,
          url: url.value
        }
      });
    } else {
      status.textContent = 'Unrecognised video link';
      onChange({
        ...block,
        content: { ...block.content, external_id: '', url: url.value }
      });
    }
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__video-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Video title');
  title.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, title: title.value || undefined } });
  });

  fields.append(url, status, title);
  return editorShell(block, onChange, fields);
}

export function createEmbedEditor(
  block: Extract<Block, { block_type: 'embed' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'embed' }>>
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__embed-url';
  url.value = block.content.url;
  url.setAttribute('aria-label', 'Embed URL');
  url.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, url: url.value } });
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__embed-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Embed title');
  title.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, title: title.value || undefined } });
  });

  fields.append(url, title);
  return editorShell(block, onChange, fields);
}

export function createHtmlEditor(
  block: Extract<Block, { block_type: 'html' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'html' }>>
): HTMLElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 8;
  textarea.setAttribute('aria-label', 'HTML');
  textarea.addEventListener('input', () => {
    onChange({ ...block, content: { html: textarea.value } });
  });
  return editorShell(block, onChange, textarea);
}

export function createBlockEditor(block: Block, onChange: BlockChangeHandler): HTMLElement {
  switch (block.block_type) {
    case 'rich_text':
      return createRichTextEditor(block, onChange);
    case 'heading':
      return createHeadingEditor(block, onChange);
    case 'callout':
      return createCalloutEditor(block, onChange);
    case 'image':
      return createImageEditor(block, onChange);
    case 'video':
      return createVideoEditor(block, onChange);
    case 'embed':
      return createEmbedEditor(block, onChange);
    case 'html':
      return createHtmlEditor(block, onChange);
  }
}
