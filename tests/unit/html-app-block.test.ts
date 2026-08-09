import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { BLOCK_GROUPS, NEW_BLOCK_TYPES, createBlock } from '@/blocks/create-block';

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

describe('html_app schema', () => {
  it('parses without ai', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: { html: '<p>Hi</p>', height_px: 480 }
    });
    expect(block.block_type).toBe('html_app');
    if (block.block_type !== 'html_app') return;
    expect(block.content.ai).toBeUndefined();
  });

  it('parses with ai lane', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'html_app',
      content: {
        html: '<button>Go</button>',
        title: 'Sort',
        height_px: 400,
        ai: {
          enabled: true,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          system: 'Stay in character as a sorting coach.',
          max_tokens: 512
        }
      }
    });
    if (block.block_type !== 'html_app') return;
    expect(block.content.ai?.provider).toBe('anthropic');
  });

  it('rejects bad provider', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'html_app',
        content: {
          html: 'x',
          ai: {
            enabled: true,
            provider: 'gemini',
            model: 'x',
            system: 'y',
            max_tokens: 100
          }
        }
      })
    ).toThrow();
  });
});

describe('createBlock html_app', () => {
  it('defaults empty html, height 480, no ai', () => {
    const block = createBlock('html_app', 'h1');
    expect(block.block_type).toBe('html_app');
    if (block.block_type !== 'html_app') return;
    expect(block.content.html).toBe('');
    expect(block.content.height_px).toBe(480);
    expect(block.content.ai).toBeUndefined();
  });

  it('lists under Basic', () => {
    expect(NEW_BLOCK_TYPES).toContain('html_app');
    const basic = BLOCK_GROUPS.find((g) => g.label === 'Basic');
    expect(basic?.types).toContain('html_app');
  });
});
