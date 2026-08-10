import { describe, it, expect, vi } from 'vitest';
import { createImageEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';
import type { Media } from '@/schemas/media';

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

const libraryImage: Media = {
  id: 'media_cover_1',
  type: 'media',
  title: 'Cover',
  slug: 'cover',
  status: 'active',
  provider: 'direct',
  media_type: 'image',
  preview_url: 'https://cdn.example/a.png',
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

  it('image editor can apply media library url', () => {
    const onChange = vi.fn();
    const editor = createImageEditor(imageBlock, onChange, () => imageBlock, {
      media: [libraryImage]
    });

    const libraryBtn = Array.from(editor.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Choose from library'
    );
    expect(libraryBtn).toBeDefined();
    libraryBtn!.click();

    const item = Array.from(editor.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cover')
    );
    expect(item).toBeDefined();
    item!.click();

    const last = onChange.mock.calls.at(-1)?.[0] as typeof imageBlock;
    expect(last.content.url).toBe('https://cdn.example/a.png');
    expect(last.content.alt_text).toBe('Cover');
  });
});
