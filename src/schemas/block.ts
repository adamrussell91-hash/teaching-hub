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
  'html',
  'quote',
  'divider',
  'definition',
  'code',
  'audio',
  'attachment',
  'accordion',
  'table',
  'question_set'
]);

export const VideoProviderSchema = z.enum(['youtube', 'vimeo']);
export const HeadingVariantSchema = z.enum(['page', 'section', 'subsection']);
export const MediaSizeVariantSchema = z.enum(['small', 'medium', 'large']);
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
export const QuestionKindSchema = z.enum(['short_answer', 'multiple_choice']);

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
  variant: MediaSizeVariantSchema.default('large'),
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
  variant: MediaSizeVariantSchema.default('large'),
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

export const QuoteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('quote'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    quote: z.string(),
    attribution: z.string().optional(),
    source: z.string().optional(),
    reference: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const DividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('divider'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});

export const DefinitionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('definition'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    term: z.string(),
    definition: z.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const CodeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('code'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    code: z.string(),
    language: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AudioBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('audio'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AttachmentBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('attachment'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string(),
    filename: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AccordionItemSchema = z.object({
  title: z.string(),
  body: z.string()
});

export const AccordionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('accordion'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    items: z.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const TableBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('table'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const QuestionItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  kind: QuestionKindSchema,
  options: z.array(z.string()).optional()
});

export const QuestionSetBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('question_set'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    questions: z.array(QuestionItemSchema)
  }),
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
  HtmlBlockSchema,
  QuoteBlockSchema,
  DividerBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  QuestionSetBlockSchema
]);

export type Block = z.infer<typeof BlockSchema>;
