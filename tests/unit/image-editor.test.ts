import { describe, it, expect, vi } from 'vitest';
import { createImageEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';

const ISO = '2026-01-01T00:00:00.000Z';

const imageBlock: Extract<Block, { block_type: 'image' }> = {
  id: 'block_img_1',
  type: 'block',
  block_type: 'image',
  variant: 'large',
  visibility: 'student_teacher',
  content: { url: '', alt_text: '' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

describe('createImageEditor', () => {
  it('keeps URL when alt text is edited after URL (no stale content wipe)', () => {
    const onChange = vi.fn();
    const editor = createImageEditor(imageBlock, onChange);

    const url = editor.querySelector<HTMLInputElement>('.block-editor__image-url');
    const alt = editor.querySelector<HTMLInputElement>('.block-editor__image-alt');
    expect(url).not.toBeNull();
    expect(alt).not.toBeNull();

    url!.value =
      'https://cdn.britannica.com/28/115328-050-4C262676/Kazuo-Ishiguro.jpg';
    url!.dispatchEvent(new Event('input', { bubbles: true }));

    alt!.value = 'Portrait of Kazuo Ishiguro';
    alt!.dispatchEvent(new Event('input', { bubbles: true }));

    const last = onChange.mock.calls.at(-1)?.[0] as typeof imageBlock;
    expect(last.content.url).toBe(
      'https://cdn.britannica.com/28/115328-050-4C262676/Kazuo-Ishiguro.jpg'
    );
    expect(last.content.alt_text).toBe('Portrait of Kazuo Ishiguro');
  });
});
