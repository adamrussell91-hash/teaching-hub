import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import {
  countBlocksInTree,
  deleteBlocksById,
  insertAt,
  insertTypeForParent,
  moveBlockTo,
  reorderSiblings
} from '@/teacher/lesson-canvas/drop';

function asSection(block: Block): Extract<Block, { block_type: 'section' }> {
  if (block.block_type !== 'section') throw new Error('expected section');
  return block;
}

function asColumns(block: Block): Extract<Block, { block_type: 'columns' }> {
  if (block.block_type !== 'columns') throw new Error('expected columns');
  return block;
}

describe('insertTypeForParent', () => {
  it('allows heading at the lesson root and refuses collection', () => {
    expect(insertTypeForParent({ kind: 'root' }, 'heading')).toBeNull();
    const reason = insertTypeForParent({ kind: 'root' }, 'collection');
    expect(typeof reason).toBe('string');
    expect(reason!.length).toBeGreaterThan(0);
  });

  it('refuses columns inside columns', () => {
    const reason = insertTypeForParent(
      { kind: 'column', id: 'cols1', columnIndex: 0 },
      'columns'
    );
    expect(typeof reason).toBe('string');
    expect(reason!.length).toBeGreaterThan(0);
    expect(insertTypeForParent({ kind: 'column', id: 'cols1', columnIndex: 0 }, 'heading')).toBeNull();
  });
});

describe('insertAt', () => {
  it('inserts a heading at root index 0', () => {
    const existing = [createBlock('rich_text', 'rt1')];
    const heading = createBlock('heading', 'h1');
    const result = insertAt(existing, { kind: 'root' }, 0, heading);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['h1', 'rt1']);
  });

  it('refuses columns inside columns', () => {
    const cols = createBlock('columns', 'cols1');
    const inner = createBlock('columns', 'cols2');
    const result = insertAt([cols], { kind: 'column', id: 'cols1', columnIndex: 0 }, 0, inner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(asColumns([cols][0]!).content.columns[0]!.blocks).toHaveLength(0);
  });

  it('does not insert types that insertTypeForParent rejects', () => {
    const collection = createBlock('collection', 'coll1');
    const result = insertAt([], { kind: 'root' }, 0, collection);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(insertTypeForParent({ kind: 'root' }, 'collection'));
  });
});

describe('moveBlockTo', () => {
  it('moves a rich_text between two siblings', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = moveBlockTo(blocks, 'rt1', { kind: 'root' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['rt1', 'h1', 'c1']);
    expect(result.blocks.filter((b) => b.id === 'rt1')).toHaveLength(1);
  });

  it('removes first then inserts, adjusting index in the same list', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = moveBlockTo(blocks, 'h1', { kind: 'root' }, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['rt1', 'h1', 'c1']);
  });
});

describe('countBlocksInTree', () => {
  it('counts nested section children', () => {
    const section = asSection(createBlock('section', 'sec1'));
    const tree: Block[] = [
      {
        ...section,
        content: {
          ...section.content,
          blocks: [createBlock('heading', 'h1'), createBlock('rich_text', 'rt1')]
        }
      }
    ];
    expect(countBlocksInTree(tree)).toBe(3);
  });
});

describe('deleteBlocksById', () => {
  it('removes a nested block inside a section', () => {
    const section = asSection(createBlock('section', 'sec1'));
    const tree: Block[] = [
      {
        ...section,
        content: {
          ...section.content,
          blocks: [createBlock('heading', 'h1'), createBlock('rich_text', 'rt1')]
        }
      }
    ];
    const next = deleteBlocksById(tree, ['h1']);
    expect(next).toHaveLength(1);
    expect(asSection(next[0]!).content.blocks.map((b) => b.id)).toEqual(['rt1']);
    expect(countBlocksInTree(next)).toBe(2);
  });
});

describe('reorderSiblings', () => {
  it('reorders root siblings by id list', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = reorderSiblings(blocks, { kind: 'root' }, ['c1', 'h1', 'rt1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['c1', 'h1', 'rt1']);
  });
});
