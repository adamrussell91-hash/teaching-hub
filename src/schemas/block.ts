import { z } from 'zod';
import { IsoDateSchema } from './common';

export const VisibilitySchema = z.enum(['student_teacher', 'teacher_only']);
export const BlockTypeSchema = z.enum([
  'rich_text',
  'heading',
  'callout',
  'image',
  'video',
  'embed',
  'html'
]);

export const VideoProviderSchema = z.enum(['youtube', 'vimeo']);
export const HeadingVariantSchema = z.enum(['page', 'section', 'subsection']);
export const CalloutStyleSchema = z.enum([
  'information',
  'important',
  'warning',
  'extension',
  'scaffold',
  'example',
  'remember',
  'teacher'
]);

const blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};

const blockLayout = {
  layout: z.record(z.unknown()).default({}),
  print: z.record(z.unknown()).default({}),
  settings: z.record(z.unknown()).default({})
};

export const RichTextBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('rich_text'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({ html: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const HeadingBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('heading'),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z.object({ text: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const CalloutBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('callout'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    style: CalloutStyleSchema,
    title: z.string().optional(),
    body: z.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ImageBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('image'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    alt_text: z.string(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const VideoBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('video'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    provider: VideoProviderSchema,
    external_id: z.string(),
    url: z.string().optional(),
    title: z.string().optional(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const EmbedBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('embed'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const HtmlBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('html'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({ html: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const BlockSchema = z.discriminatedUnion('block_type', [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema
]);

export type Block = z.infer<typeof BlockSchema>;
