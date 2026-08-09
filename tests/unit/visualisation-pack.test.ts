import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  BLOCK_GROUPS,
  COLUMN_CHILD_TYPES,
  TAB_CHILD_TYPES,
  createBlock,
  cloneBlockWithNewIds,
  NEW_BLOCK_TYPES
} from '@/blocks/create-block';

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

describe('Visualisation schemas', () => {
  it('parses chart / equation / diagram / mind_map / concept_map', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: [{ id: 's1', name: 'A', points: [{ x: 'Jan', y: 1 }] }]
        }
      }).block_type
    ).toBe('chart');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'equation',
        content: { latex: 'E = mc^2' }
      }).block_type
    ).toBe('equation');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'diagram',
        content: { source: 'image', image_url: '', image_alt: '' }
      }).block_type
    ).toBe('diagram');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'mind_map',
        content: {
          nodes: [
            { id: 'n1', label: 'Centre', parent_id: null },
            { id: 'n2', label: 'Child', parent_id: 'n1' }
          ],
          edges: []
        }
      }).block_type
    ).toBe('mind_map');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'concept_map',
        content: {
          nodes: [
            { id: 'n1', label: 'A' },
            { id: 'n2', label: 'B' }
          ],
          edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'leads to' }]
        }
      }).block_type
    ).toBe('concept_map');
  });

  it('rejects chart with zero series', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: { chart_type: 'bar', series: [] }
      })
    ).toThrow();
  });

  it('rejects chart with more than six series', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: Array.from({ length: 7 }, (_, i) => ({
            id: `s${i + 1}`,
            name: `S${i + 1}`,
            points: [{ x: 'A', y: 1 }]
          }))
        }
      })
    ).toThrow();
  });
});

describe('createBlock visualisation defaults', () => {
  it('creates chart with one series and three points', () => {
    const block = createBlock('chart', 'c1');
    expect(block.block_type).toBe('chart');
    if (block.block_type !== 'chart') return;
    expect(block.content.series).toHaveLength(1);
    expect(block.content.series[0].points).toHaveLength(3);
  });

  it('creates mind_map with centre + two children', () => {
    const block = createBlock('mind_map', 'm1');
    expect(block.block_type).toBe('mind_map');
    if (block.block_type !== 'mind_map') return;
    expect(block.content.nodes).toHaveLength(3);
  });

  it('creates concept_map with two nodes and one labelled edge', () => {
    const block = createBlock('concept_map', 'cm1');
    expect(block.block_type).toBe('concept_map');
    if (block.block_type !== 'concept_map') return;
    expect(block.content.nodes).toHaveLength(2);
    expect(block.content.edges).toHaveLength(1);
    expect(block.content.edges[0].label?.length).toBeGreaterThan(0);
  });

  it('lists Visualisation group and allows nesting', () => {
    const viz = BLOCK_GROUPS.find((g) => g.label === 'Visualisation');
    expect(viz?.types).toEqual(['chart', 'equation', 'diagram', 'mind_map', 'concept_map']);
    for (const t of viz!.types) {
      expect(NEW_BLOCK_TYPES).toContain(t);
      expect(COLUMN_CHILD_TYPES).toContain(t);
      expect(TAB_CHILD_TYPES).toContain(t);
    }
  });

  it('clone regenerates nested ids for chart and maps', () => {
    const chart = createBlock('chart', 'c1');
    const mind = createBlock('mind_map', 'm1');
    let n = 0;
    const nextId = () => `id_${++n}`;
    const c2 = cloneBlockWithNewIds(chart, nextId);
    const m2 = cloneBlockWithNewIds(mind, nextId);
    expect(c2.id).not.toBe(chart.id);
    if (c2.block_type === 'chart' && chart.block_type === 'chart') {
      expect(c2.content.series[0].id).not.toBe(chart.content.series[0].id);
    }
    if (m2.block_type === 'mind_map' && mind.block_type === 'mind_map') {
      expect(m2.content.nodes[0].id).not.toBe(mind.content.nodes[0].id);
    }
  });
});
