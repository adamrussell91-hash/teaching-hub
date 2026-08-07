import { describe, it, expect } from 'vitest';
import {
  BlockSchema,
  LessonSchema,
  PublishedLessonSchema,
  PublishableLessonSchema,
  toPublishedLesson
} from '@/schemas';

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

describe('BlockSchema', () => {
  it('parses rich_text block with html content', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'rich_text',
      content: { html: '<p>Hello</p>' }
    });
    expect(block.block_type).toBe('rich_text');
    expect(block.content).toEqual({ html: '<p>Hello</p>' });
  });

  it('parses heading block with text and section variant', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'heading',
      variant: 'section',
      content: { text: 'Memory and Identity' }
    });
    expect(block.block_type).toBe('heading');
    expect(block.variant).toBe('section');
    expect(block.content).toEqual({ text: 'Memory and Identity' });
  });

  it('parses callout block with style, title, and body', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'callout',
      content: {
        style: 'extension',
        title: 'Extension',
        body: 'Consider how memory shapes identity.'
      }
    });
    expect(block.block_type).toBe('callout');
    expect(block.content).toEqual({
      style: 'extension',
      title: 'Extension',
      body: 'Consider how memory shapes identity.'
    });
  });

  it('rejects unknown block_type', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'quote',
        content: { quote: 'test' }
      })
    ).toThrow();
  });

  it('rejects heading with invalid variant', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'heading',
        variant: 'medium',
        content: { text: 'Bad heading' }
      })
    ).toThrow();
  });
});

describe('LessonSchema', () => {
  const draftLesson = {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      {
        ...baseBlock,
        id: 'block_l008_001',
        block_type: 'heading',
        variant: 'page',
        content: { text: 'Memory, Identity and Ono' }
      },
      {
        ...baseBlock,
        id: 'block_l008_002',
        block_type: 'rich_text',
        content: { html: '<p>Ono reflects on his past.</p>' }
      }
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const
  };

  it('parses draft lesson with blocks array', () => {
    const lesson = LessonSchema.parse(draftLesson);
    expect(lesson.type).toBe('lesson');
    expect(lesson.blocks).toHaveLength(2);
    expect(lesson.blocks[0].block_type).toBe('heading');
  });

  it('accepts optional published_at', () => {
    const lesson = LessonSchema.parse({
      ...draftLesson,
      published_at: '2026-02-01T12:00:00.000Z'
    });
    expect(lesson.published_at).toBe('2026-02-01T12:00:00.000Z');
  });
});

describe('PublishedLessonSchema', () => {
  it('parses published snapshot shape', () => {
    const snapshot = PublishedLessonSchema.parse({
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory, Identity and Ono',
      unit_id: 'unit_aotfw',
      blocks: [
        {
          ...baseBlock,
          block_type: 'rich_text',
          content: { html: '<p>Published content</p>' }
        }
      ],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    expect(snapshot.lesson_id).toBe('lesson_aotfw_008');
    expect(snapshot.blocks).toHaveLength(1);
  });
});

describe('publish helper', () => {
  const validLesson = {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      {
        ...baseBlock,
        block_type: 'rich_text',
        content: { html: '<p>Content</p>' }
      }
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const
  };

  it('rejects empty title on PublishableLessonSchema', () => {
    expect(() =>
      PublishableLessonSchema.parse({ ...validLesson, title: '' })
    ).toThrow();
  });

  it('rejects whitespace-only title on PublishableLessonSchema', () => {
    expect(() =>
      PublishableLessonSchema.parse({ ...validLesson, title: '   ' })
    ).toThrow();
  });

  it('builds published snapshot via toPublishedLesson', () => {
    const lesson = LessonSchema.parse(validLesson);
    const snapshot = toPublishedLesson(lesson, '2026-02-01T12:00:00.000Z');
    expect(snapshot.lesson_id).toBe('lesson_aotfw_008');
    expect(snapshot.title).toBe('Memory, Identity and Ono');
    expect(snapshot.published_at).toBe('2026-02-01T12:00:00.000Z');
    expect(snapshot.blocks).toHaveLength(1);
  });
});
