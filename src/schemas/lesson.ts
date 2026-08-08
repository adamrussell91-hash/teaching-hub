import { z } from 'zod';
import { CommonFields, IsoDateSchema } from './common';
import { BlockSchema } from './block';
import { isHttpUrl } from '../blocks/url-safety';

export const LessonSchema = z.object({
  ...CommonFields,
  type: z.literal('lesson'),
  unit_id: z.string().min(1),
  sequence: z.number().int(),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema.optional()
});

function publishBlockIssues(blocks: z.infer<typeof BlockSchema>[]): string | null {
  for (const block of blocks) {
    if (block.block_type === 'image') {
      if (!isHttpUrl(block.content.url) || block.content.alt_text.trim().length === 0) {
        return 'Image blocks need a valid URL and alt text to publish';
      }
    }
    if (block.block_type === 'video') {
      if (!block.content.external_id.trim()) {
        return 'Video blocks need a recognised YouTube or Vimeo id to publish';
      }
    }
    if (block.block_type === 'embed') {
      if (!isHttpUrl(block.content.url)) {
        return 'Embed blocks need a valid http(s) URL to publish';
      }
    }
    if (block.block_type === 'html') {
      if (block.content.html.trim().length === 0) {
        return 'HTML blocks need content to publish';
      }
    }
  }
  return null;
}

export const PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Title is required to publish',
      path: ['title']
    });
  }
  const blockIssue = publishBlockIssues(lesson.blocks);
  if (blockIssue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: blockIssue, path: ['blocks'] });
  }
});

export type Lesson = z.infer<typeof LessonSchema>;
