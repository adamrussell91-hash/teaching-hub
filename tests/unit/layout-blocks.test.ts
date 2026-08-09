import { describe, it, expect } from 'vitest';
import { createBlock, cloneBlockWithNewIds } from '@/blocks/create-block';
import { BlockSchema } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

const rich = (id: string, html = '') => ({
  ...base,
  id,
  block_type: 'rich_text' as const,
  content: { html }
});

describe('layout block schemas', () => {
  it('parses spacer, section, and columns', () => {
    expect(
      BlockSchema.parse({
        ...base,
        id: 'sp1',
        block_type: 'spacer',
        content: { size: 'medium' }
      }).block_type
    ).toBe('spacer');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'sec1',
        block_type: 'section',
        content: { title: 'Week 1', blocks: [rich('c1')] }
      }).block_type
    ).toBe('section');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'col1',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            { width: 6, blocks: [rich('l')] },
            { width: 6, blocks: [rich('r')] }
          ]
        }
      }).block_type
    ).toBe('columns');
  });

  it('rejects columns nested inside columns', () => {
    const nestedColumns = {
      ...base,
      id: 'inner',
      block_type: 'columns' as const,
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    };
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [nestedColumns] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside section', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'section',
      content: {
        title: 'Outer',
        blocks: [
          {
            ...base,
            id: 'inner',
            block_type: 'section',
            content: { title: 'Inner', blocks: [] }
          }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside a column', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'cols',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          {
            width: 6,
            blocks: [
              {
                ...base,
                id: 'sec',
                block_type: 'section',
                content: { title: 'Nope', blocks: [] }
              }
            ]
          },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('allows columns inside a section', () => {
    const parsed = BlockSchema.parse({
      ...base,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Layout',
        blocks: [
          {
            ...base,
            id: 'cols',
            block_type: 'columns',
            content: {
              preset: '33-67',
              columns: [
                { width: 4, blocks: [rich('a')] },
                { width: 8, blocks: [rich('b')] }
              ]
            }
          }
        ]
      }
    });
    expect(parsed.block_type).toBe('section');
  });

  it('rejects column widths that do not sum to 12', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'bad',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 5, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });
});

describe('createBlock layout defaults', () => {
  it('creates empty columns for 50-50', () => {
    const block = createBlock('columns', 'c1');
    expect(block.block_type).toBe('columns');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    expect(block.content.preset).toBe('50-50');
    expect(block.content.columns).toEqual([
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ]);
  });

  it('creates section and spacer defaults', () => {
    expect(createBlock('section', 's1')).toMatchObject({
      block_type: 'section',
      content: { title: '', blocks: [] }
    });
    expect(createBlock('spacer', 'sp1')).toMatchObject({
      block_type: 'spacer',
      content: { size: 'medium' }
    });
  });
});

describe('cloneBlockWithNewIds', () => {
  it('assigns new ids to nested descendants', () => {
    let n = 0;
    const nextId = () => `id_${++n}`;

    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks.push(
      createBlock('rich_text', 'rt') as (typeof columns.content.columns)[number]['blocks'][number]
    );
    section.content.blocks = [columns];

    const clone = cloneBlockWithNewIds(section, nextId);
    expect(clone.id).toBe('id_1');
    if (clone.block_type !== 'section') throw new Error('expected section');
    const clonedCols = clone.content.blocks[0]!;
    expect(clonedCols.id).toBe('id_2');
    if (clonedCols.block_type !== 'columns') throw new Error('expected columns');
    expect(clonedCols.content.columns[0]!.blocks[0]!.id).toBe('id_3');
    expect(section.id).toBe('sec'); // original untouched
  });
});
