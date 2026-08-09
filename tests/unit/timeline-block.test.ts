import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES } from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function emptyEvent(id: string) {
  return { id, when: '', label: '', description: '' };
}

describe('TimelineBlockSchema', () => {
  it('parses timeline with events', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'timeline',
      content: {
        events: [
          {
            id: 'e1',
            when: '1788',
            label: 'First Fleet',
            description: 'Arrival',
            image_url: 'https://example.com/a.png',
            image_alt: 'Fleet',
            link_url: 'https://example.com',
            link_label: 'Read more'
          }
        ]
      }
    });
    expect(block.block_type).toBe('timeline');
    expect(block.content.events).toHaveLength(1);
  });

  it('rejects zero events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: { events: [] }
      })
    ).toThrow();
  });

  it('rejects more than 12 events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: {
          events: Array.from({ length: 13 }, (_, i) => emptyEvent(`e${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects timeline inside a columns cell', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        id: 'cols',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            {
              width: 6,
              blocks: [
                {
                  ...baseBlock,
                  id: 'tl',
                  block_type: 'timeline',
                  content: { events: [emptyEvent('e1')] }
                }
              ]
            },
            { width: 6, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });

  it('allows timeline inside a section', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Era',
        blocks: [
          {
            ...baseBlock,
            id: 'tl',
            block_type: 'timeline',
            content: { events: [emptyEvent('e1')] }
          }
        ]
      }
    });
    expect(block.content.blocks[0]?.block_type).toBe('timeline');
  });
});

describe('createBlock timeline', () => {
  it('creates 3 empty events', () => {
    const block = createBlock('timeline', 'tl1');
    expect(block.block_type).toBe('timeline');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    expect(block.content.events).toHaveLength(3);
    expect(block.content.events.map((e) => e.id)).toEqual(['tl1_e1', 'tl1_e2', 'tl1_e3']);
    expect(block.content.events[0]).toMatchObject({
      when: '',
      label: '',
      description: ''
    });
  });

  it('COLUMN_CHILD_TYPES excludes timeline', () => {
    expect(COLUMN_CHILD_TYPES.includes('timeline')).toBe(false);
  });

  it('clone regenerates event ids', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events[0]!.label = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'timeline') throw new Error('expected timeline');
    expect(cloned.content.events.map((e) => e.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.events[0]!.label).toBe('A');
  });
});
