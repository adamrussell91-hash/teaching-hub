import { describe, it, expect } from 'vitest';
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
