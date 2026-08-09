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
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import {
  validateMindMap,
  validateConceptMap,
  layoutMindMap,
  layoutConceptMap
} from '@/blocks/graph-layout';
import { buildChartSvg, buildChartTableRows } from '@/blocks/chart-svg';

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

  it('rejects chart series with more than 24 points', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: [
            {
              id: 's1',
              name: 'A',
              points: Array.from({ length: 25 }, (_, i) => ({ x: `p${i}`, y: i }))
            }
          ]
        }
      })
    ).toThrow();
  });

  it('rejects mind_map with zero nodes', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'mind_map',
        content: { nodes: [], edges: [] }
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
    const concept = createBlock('concept_map', 'cm1');
    let n = 0;
    const nextId = () => `id_${++n}`;
    const c2 = cloneBlockWithNewIds(chart, nextId);
    const m2 = cloneBlockWithNewIds(mind, nextId);
    const cm2 = cloneBlockWithNewIds(concept, nextId);

    expect(c2.id).not.toBe(chart.id);
    if (c2.block_type === 'chart' && chart.block_type === 'chart') {
      expect(c2.content.series[0].id).not.toBe(chart.content.series[0].id);
    }

    expect(m2.block_type).toBe('mind_map');
    expect(mind.block_type).toBe('mind_map');
    if (m2.block_type === 'mind_map' && mind.block_type === 'mind_map') {
      const [origRoot, ...origChildren] = mind.content.nodes;
      const [clonedRoot, ...clonedChildren] = m2.content.nodes;
      expect(clonedRoot.id).not.toBe(origRoot.id);
      expect(clonedRoot.parent_id).toBeNull();
      for (let i = 0; i < origChildren.length; i++) {
        expect(clonedChildren[i].id).not.toBe(origChildren[i].id);
        expect(clonedChildren[i].parent_id).toBe(clonedRoot.id);
        expect(clonedChildren[i].parent_id).not.toBe(origRoot.id);
      }
    }

    expect(cm2.block_type).toBe('concept_map');
    expect(concept.block_type).toBe('concept_map');
    if (cm2.block_type === 'concept_map' && concept.block_type === 'concept_map') {
      expect(cm2.content.nodes).toHaveLength(2);
      expect(cm2.content.edges).toHaveLength(1);
      expect(cm2.content.nodes[0].id).not.toBe(concept.content.nodes[0].id);
      expect(cm2.content.nodes[1].id).not.toBe(concept.content.nodes[1].id);
      expect(cm2.content.edges[0].id).not.toBe(concept.content.edges[0].id);
      expect(cm2.content.edges[0].from).toBe(cm2.content.nodes[0].id);
      expect(cm2.content.edges[0].to).toBe(cm2.content.nodes[1].id);
      expect(cm2.content.edges[0].from).not.toBe(concept.content.nodes[0].id);
      expect(cm2.content.edges[0].to).not.toBe(concept.content.nodes[1].id);
    }
  });
});

describe('sanitizeSvgMarkup', () => {
  it('strips script and on* handlers', () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle onclick="evil()" r="5"/></svg>'
    );
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).toMatch(/<circle/i);
  });

  it('strips foreignObject and external hrefs', () => {
    const out = sanitizeSvgMarkup(
      '<svg><foreignObject><div>x</div></foreignObject><use href="https://evil.test/x"/></svg>'
    );
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/https:\/\/evil/i);
  });

  it('escapes entity-encoded markup in text so it cannot break out', () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>'
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/&lt;\/text&gt;/i);
    expect(out).toMatch(/&lt;script&gt;/i);
  });

  it('strips data URI hrefs', () => {
    const out = sanitizeSvgMarkup(
      '<svg><use href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>'
    );
    expect(out).not.toMatch(/data:image\/svg\+xml/i);
    expect(out).toMatch(/<use/i);
  });
});

describe('graph-layout validators', () => {
  it('mind map requires one root and no cycles', () => {
    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: null },
          { id: 'b', label: 'B', parent_id: 'a' }
        ],
        edges: []
      })
    ).toBeNull();

    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: null },
          { id: 'b', label: 'B', parent_id: null }
        ],
        edges: []
      })
    ).toMatch(/root/i);

    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: 'b' },
          { id: 'b', label: 'B', parent_id: 'a' }
        ],
        edges: []
      })
    ).toMatch(/cycle/i);
  });

  it('concept map requires labelled edges and valid endpoints', () => {
    expect(
      validateConceptMap({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b', label: 'to' }]
      })
    ).toBeNull();

    expect(
      validateConceptMap({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b', label: '  ' }]
      })
    ).toMatch(/label/i);
  });

  it('layout helpers return deterministic positioned nodes', () => {
    const mindNodes = [
      { id: 'b', label: 'B', parent_id: 'a' },
      { id: 'a', label: 'A', parent_id: null },
      { id: 'c', label: 'C', parent_id: 'a' }
    ];
    const mindLayout = layoutMindMap(mindNodes);
    expect(mindLayout).toHaveLength(mindNodes.length);
    for (const node of mindLayout) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(layoutMindMap(mindNodes)).toEqual(mindLayout);

    const conceptNodes = [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' }
    ];
    const conceptEdges = [{ id: 'e1', from: 'a', to: 'b', label: 'to' }];
    const conceptLayout = layoutConceptMap(conceptNodes, conceptEdges);
    expect(conceptLayout.nodes).toHaveLength(conceptNodes.length);
    for (const node of conceptLayout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(conceptLayout.edges).toHaveLength(1);
    expect(Number.isFinite(conceptLayout.edges[0].x1)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].y1)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].x2)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].y2)).toBe(true);
    expect(layoutConceptMap(conceptNodes, conceptEdges)).toEqual(conceptLayout);
  });
});

describe('chart-svg', () => {
  it('emits svg and table rows for bar chart', () => {
    const content = {
      chart_type: 'bar' as const,
      title: 'Demo',
      series: [{ id: 's1', name: 'S', points: [{ x: 'A', y: 2 }, { x: 'B', y: 4 }] }]
    };
    const svg = buildChartSvg(content);
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svg).toMatch(/A/);
    const rows = buildChartTableRows(content);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
