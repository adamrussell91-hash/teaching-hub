import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES, TAB_CHILD_TYPES } from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'large',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function item(id: string, overrides: Partial<{ url: string; alt_text: string; caption: string }> = {}) {
  return {
    id,
    url: overrides.url ?? '',
    alt_text: overrides.alt_text ?? '',
    ...(overrides.caption !== undefined ? { caption: overrides.caption } : {})
  };
}

describe('GalleryBlockSchema', () => {
  it('parses gallery with grid layout and items', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'gallery',
      content: {
        layout: 'grid',
        items: [
          item('i1', {
            url: 'https://example.com/a.png',
            alt_text: 'A',
            caption: 'Caption A'
          }),
          item('i2', { url: 'https://example.com/b.png', alt_text: 'B' })
        ]
      }
    });
    expect(block.block_type).toBe('gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(2);
  });

  it('rejects fewer than 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: { layout: 'grid', items: [item('i1')] }
      })
    ).toThrow();
  });

  it('rejects more than 12 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'carousel',
          items: Array.from({ length: 13 }, (_, i) => item(`i${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects comparison with not exactly 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'comparison',
          items: [item('i1'), item('i2'), item('i3')]
        }
      })
    ).toThrow();
  });

  it('allows gallery inside columns, section, and tabs', () => {
    const gallery = {
      ...baseBlock,
      id: 'g1',
      block_type: 'gallery' as const,
      content: { layout: 'grid' as const, items: [item('a'), item('b')] }
    };

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'cols',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            { width: 6, blocks: [gallery] },
            { width: 6, blocks: [] }
          ]
        }
      }).content.columns[0]!.blocks[0]!.block_type
    ).toBe('gallery');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'sec',
        block_type: 'section',
        content: { title: 'Media', blocks: [gallery] }
      }).content.blocks[0]!.block_type
    ).toBe('gallery');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'tabs',
        block_type: 'tabs',
        content: {
          tabs: [
            { id: 't1', label: 'One', blocks: [gallery] },
            { id: 't2', label: 'Two', blocks: [] }
          ]
        }
      }).content.tabs[0]!.blocks[0]!.block_type
    ).toBe('gallery');
  });
});

describe('createBlock gallery', () => {
  it('creates 3 empty items with grid layout', () => {
    const block = createBlock('gallery', 'g1');
    expect(block.block_type).toBe('gallery');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(3);
    expect(block.content.items.map((i) => i.id)).toEqual(['g1_i1', 'g1_i2', 'g1_i3']);
    expect(block.variant).toBe('large');
  });

  it('COLUMN_CHILD_TYPES and TAB_CHILD_TYPES include gallery', () => {
    expect(COLUMN_CHILD_TYPES.includes('gallery')).toBe(true);
    expect(TAB_CHILD_TYPES.includes('gallery')).toBe(true);
  });

  it('clone regenerates item ids', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    block.content.items[0]!.alt_text = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'gallery') throw new Error('expected gallery');
    expect(cloned.content.items.map((i) => i.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.items[0]!.alt_text).toBe('A');
  });
});
