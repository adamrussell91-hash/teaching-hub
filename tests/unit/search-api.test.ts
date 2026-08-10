import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { runContentSearch } from '@/search/run-content-search';

describe('runContentSearch', () => {
  it('returns empty for short queries', () => {
    expect(
      runContentSearch('n', {
        lessons: [
          {
            id: 'l1',
            blocks: [{ ...createBlock('heading', 'h1'), content: { text: 'Newton' } }]
          }
        ],
        units: [],
        compositions: []
      })
    ).toEqual([]);
  });

  it('finds lesson block text with snippet', () => {
    const hits = runContentSearch('newton', {
      lessons: [
        {
          id: 'l1',
          blocks: [
            {
              ...createBlock('rich_text', 'r1'),
              content: { html: '<p>Isaac Newton changed physics</p>' }
            }
          ]
        }
      ],
      units: [],
      compositions: []
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'lesson', id: 'l1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('newton');
  });

  it('finds unit block text', () => {
    const hits = runContentSearch('friction', {
      lessons: [],
      units: [
        {
          id: 'u1',
          blocks: [
            {
              ...createBlock('heading', 'h1'),
              content: { text: 'Friction and surfaces' }
            }
          ]
        }
      ],
      compositions: []
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'unit', id: 'u1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('friction');
  });

  it('finds composition root section text', () => {
    const root = {
      ...createBlock('section', 'sec1'),
      content: {
        title: 'Lab write-up',
        blocks: [
          {
            ...createBlock('rich_text', 'r1'),
            content: { html: '<p>Record your hypothesis carefully</p>' }
          }
        ]
      }
    };
    const hits = runContentSearch('hypothesis', {
      lessons: [],
      units: [],
      compositions: [{ id: 'c1', blocks: [root] }]
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'composition', id: 'c1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('hypothesis');
  });
});
