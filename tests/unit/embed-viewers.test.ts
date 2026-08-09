import { describe, it, expect } from 'vitest';
import { EmbedBlockSchema, EmbedProviderSchema } from '@/schemas/block';
import type { Block } from '@/schemas/block';
import {
  createBlock,
  createFromInsertMenu,
  EMBED_INSERT_PRESETS,
  INSERT_MENU_LABEL,
  expandGroupTypesForMenu
} from '@/blocks/create-block';
import { createEmbedEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

describe('embed provider schema', () => {
  it('accepts all providers', () => {
    for (const provider of EmbedProviderSchema.options) {
      const block = EmbedBlockSchema.parse({
        id: 'e1',
        type: 'block',
        block_type: 'embed',
        variant: 'large',
        visibility: 'student_teacher',
        layout: {},
        print: {},
        settings: {},
        ...timestamps,
        schema_version: 1,
        content: { url: 'https://example.com', provider }
      });
      expect(block.content.provider).toBe(provider);
    }
  });

  it('accepts legacy embed without provider', () => {
    const block = EmbedBlockSchema.parse({
      id: 'e1',
      type: 'block',
      block_type: 'embed',
      variant: 'large',
      visibility: 'student_teacher',
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1,
      content: { url: 'https://example.com' }
    });
    expect(block.content.provider).toBeUndefined();
  });
});

describe('embed insert presets', () => {
  it('createBlock embed defaults to generic', () => {
    const block = createBlock('embed', 'e1');
    expect(block.block_type).toBe('embed');
    if (block.block_type === 'embed') {
      expect(block.content.provider).toBe('generic');
    }
  });

  it('createFromInsertMenu sets providers for Map/Slides/Document/PDF', () => {
    const expected: Record<string, string> = {
      'embed:google_maps': 'google_maps',
      'embed:google_slides': 'google_slides',
      'embed:google_docs': 'google_docs',
      'embed:pdf': 'pdf'
    };
    for (const preset of EMBED_INSERT_PRESETS) {
      const block = createFromInsertMenu(preset.value, 'x') as Extract<
        Block,
        { block_type: 'embed' }
      >;
      expect(block.block_type).toBe('embed');
      expect(block.content.provider).toBe(expected[preset.value]);
    }
  });

  it('expandGroupTypesForMenu inserts aliases after embed', () => {
    const expanded = expandGroupTypesForMenu(['video', 'embed', 'audio']);
    expect(expanded).toEqual([
      'video',
      'embed',
      'embed:google_maps',
      'embed:google_slides',
      'embed:google_docs',
      'embed:pdf',
      'audio'
    ]);
    expect(INSERT_MENU_LABEL['embed:google_slides']).toBe('Slides');
  });
});

describe('embed editor detect', () => {
  it('updates provider and embed_url when URL changes', () => {
    const block = createBlock('embed', 'e1') as Extract<Block, { block_type: 'embed' }>;
    let latest = block;
    const root = createEmbedEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    const url = root.querySelector('.block-editor__embed-url') as HTMLInputElement;
    url.value = 'https://docs.google.com/presentation/d/abc123XYZ/edit';
    url.dispatchEvent(new Event('input'));

    expect(latest.content.provider).toBe('google_slides');
    expect(latest.content.embed_url).toBe(
      'https://docs.google.com/presentation/d/abc123XYZ/embed'
    );
  });
});

describe('embed hybrid render', () => {
  const base = {
    id: 'b1',
    type: 'block' as const,
    variant: 'large',
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  it('renders slides iframe from embed_url', () => {
    const el = renderBlock(
      {
        ...base,
        block_type: 'embed',
        content: {
          url: 'https://docs.google.com/presentation/d/abc/edit',
          provider: 'google_slides',
          embed_url: 'https://docs.google.com/presentation/d/abc/embed',
          title: 'Deck'
        }
      },
      'student'
    );
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/abc/embed'
    );
    expect(el.querySelector('a')?.getAttribute('href')).toContain('presentation');
  });

  it('renders docs as resource card without iframe', () => {
    const el = renderBlock(
      {
        ...base,
        block_type: 'embed',
        content: {
          url: 'https://docs.google.com/document/d/doc1/edit',
          provider: 'google_docs',
          title: 'Worksheet'
        }
      },
      'student'
    );
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.block-embed__card')).toBeTruthy();
    expect(el.querySelector('a')?.textContent).toMatch(/Open/i);
  });
});
