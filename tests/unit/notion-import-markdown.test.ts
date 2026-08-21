import { describe, expect, it } from 'vitest';
import { markdownToBlocks } from '@/import/notion/markdown-to-blocks';

function nextId(): () => string {
  let n = 0;
  return () => `block_${++n}`;
}

function convert(markdown: string, title = 'Memory and Identity') {
  return markdownToBlocks(markdown, { title, nextId: nextId() });
}

describe('markdownToBlocks', () => {
  it('maps headings, paragraphs, lists, quotes, fences, and dividers', () => {
    const blocks = convert(
      [
        '# Memory and Identity',
        '',
        'Ono **reflects** on his past.',
        '',
        '## Themes',
        '',
        '- Memory',
        '- Identity',
        '',
        '> A man has to forgive himself.',
        '',
        '```ts',
        'const x = 1;',
        '```',
        '',
        '---'
      ].join('\n')
    );

    expect(blocks.map((block) => block.block_type)).toEqual([
      'rich_text',
      'heading',
      'rich_text',
      'quote',
      'code',
      'divider'
    ]);
    expect(blocks[0]).toMatchObject({
      block_type: 'rich_text',
      content: { html: '<p>Ono <strong>reflects</strong> on his past.</p>' }
    });
    expect(blocks[1]).toMatchObject({
      block_type: 'heading',
      variant: 'section',
      content: { text: 'Themes' }
    });
    expect(blocks[2]).toMatchObject({
      content: { html: '<ul><li>Memory</li><li>Identity</li></ul>' }
    });
    expect(blocks[3]).toMatchObject({ content: { quote: 'A man has to forgive himself.' } });
    expect(blocks[4]).toMatchObject({ content: { code: 'const x = 1;', language: 'ts' } });
  });

  it('maps emoji blockquotes to callouts and GFM tables to tables', () => {
    const blocks = convert(
      [
        '> 💡 Students often miss the shift in tone.',
        '',
        '| Device | Effect |',
        '| --- | --- |',
        '| Motif | Recurrence |'
      ].join('\n')
    );
    expect(blocks[0]).toMatchObject({
      block_type: 'callout',
      content: { style: 'information', body: 'Students often miss the shift in tone.' }
    });
    expect(blocks[1]).toMatchObject({
      block_type: 'table',
      content: { headers: ['Device', 'Effect'], rows: [['Motif', 'Recurrence']] }
    });
  });

  it('maps details to accordion items and images to image blocks', () => {
    const blocks = convert(
      [
        '<details><summary>Hint</summary>Look at the ending.</details>',
        '',
        '![Classroom](Memory%20page/photo.png)'
      ].join('\n')
    );
    expect(blocks[0]).toMatchObject({
      block_type: 'accordion',
      content: { items: [{ title: 'Hint', body: 'Look at the ending.' }] }
    });
    expect(blocks[1]).toMatchObject({
      block_type: 'image',
      content: { url: 'Memory%20page/photo.png', alt_text: 'Classroom' }
    });
  });
});
