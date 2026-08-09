import { describe, it, expect } from 'vitest';
import { EmbedBlockSchema, EmbedProviderSchema } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

describe('embed provider schema', () => {
  it('accepts all providers', () => {
    for (const provider of EmbedProviderSchema.options) {
      const block = EmbedBlockSchema.parse({
        id: 'e1',
        type: 'block',
        block_type: 'embed',
        variant: 'large',
        visibility: 'student_teacher',
        layout: {},
        print: {},
        settings: {},
        ...timestamps,
        schema_version: 1,
        content: { url: 'https://example.com', provider }
      });
      expect(block.content.provider).toBe(provider);
    }
  });

  it('accepts legacy embed without provider', () => {
    const block = EmbedBlockSchema.parse({
      id: 'e1',
      type: 'block',
      block_type: 'embed',
      variant: 'large',
      visibility: 'student_teacher',
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1,
      content: { url: 'https://example.com' }
    });
    expect(block.content.provider).toBeUndefined();
  });
});
