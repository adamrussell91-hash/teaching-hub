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

  it('parses image, video, embed, and html blocks', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/a.png', alt_text: 'A painting', caption: 'Fig 1' }
      }).block_type
    ).toBe('image');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_v',
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ' }
      }).block_type
    ).toBe('video');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_e',
        block_type: 'embed',
        variant: 'large',
        content: { url: 'https://example.com/page', title: 'Example' }
      }).block_type
    ).toBe('embed');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_h',
        block_type: 'html',
        content: { html: '<p>Hi</p>' }
      }).block_type
    ).toBe('html');
  });

  it('allows empty image url in drafts', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'image',
      variant: 'large',
      content: { url: '', alt_text: '' }
    });
    expect(block.block_type).toBe('image');
    if (block.block_type === 'image') {
      expect(block.content.url).toBe('');
    }
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
    const result = PublishableLessonSchema.safeParse({ ...validLesson, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only title on PublishableLessonSchema', () => {
    const result = PublishableLessonSchema.safeParse({ ...validLesson, title: '   ' });
    expect(result.success).toBe(false);
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

describe('PublishableLessonSchema media rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  const okImage = {
    ...baseBlock,
    block_type: 'image' as const,
    variant: 'large',
    content: { url: 'https://example.com/a.png', alt_text: 'Alt' }
  };

  it('rejects image missing alt_text on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okImage, content: { url: 'https://example.com/a.png', alt_text: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects javascript image url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'image',
          variant: 'large',
          content: { url: 'javascript:alert(1)', alt_text: 'x' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects unrecognised video on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'video',
          variant: 'large',
          content: { provider: 'youtube', external_id: '' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty html after trim on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...baseBlock, block_type: 'html', content: { html: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid image video embed html together', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        okImage,
        {
          ...baseBlock,
          id: 'b2',
          block_type: 'video',
          variant: 'large',
          content: { provider: 'vimeo', external_id: '123456789' }
        },
        {
          ...baseBlock,
          id: 'b3',
          block_type: 'embed',
          variant: 'large',
          content: { url: 'https://example.com' }
        },
        {
          ...baseBlock,
          id: 'b4',
          block_type: 'html',
          content: { html: '<p>Ok</p>' }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});
