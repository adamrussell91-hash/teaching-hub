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
      if (!isHttpUrl(block.content.url)) {
        return 'Image blocks need a valid http(s) URL to publish';
      }
      if (block.content.alt_text.trim().length === 0) {
        return 'Image blocks need alt text to publish';
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
    if (block.block_type === 'audio') {
      if (!isHttpUrl(block.content.url)) {
        return 'Audio blocks need a valid http(s) URL to publish';
      }
    }
    if (block.block_type === 'attachment') {
      if (!isHttpUrl(block.content.url)) {
        return 'Attachment blocks need a valid http(s) URL to publish';
      }
      if (block.content.title.trim().length === 0) {
        return 'Attachment blocks need a title to publish';
      }
    }
    if (block.block_type === 'question_set') {
      if (block.content.questions.length === 0) {
        return 'Question set blocks need at least one question to publish';
      }
      for (const question of block.content.questions) {
        if (question.prompt.trim().length === 0) {
          return 'Question set blocks need a non-empty prompt on every question to publish';
        }
        if (question.kind === 'multiple_choice') {
          const options = (question.options ?? []).map((option) => option.trim()).filter(Boolean);
          if (options.length < 2) {
            return 'Multiple choice questions need at least two options to publish';
          }
        }
      }
    }
    if (block.block_type === 'quote') {
      if (block.content.quote.trim().length === 0) {
        return 'Quote blocks need quote text to publish';
      }
    }
    if (block.block_type === 'definition') {
      if (block.content.term.trim().length === 0 || block.content.definition.trim().length === 0) {
        return 'Definition blocks need a term and definition to publish';
      }
    }
    if (block.block_type === 'table') {
      if (block.content.headers.length === 0) {
        return 'Table blocks need at least one header to publish';
      }
    }
    if (block.block_type === 'section') {
      if (block.content.title.trim().length === 0) {
        return 'Section blocks need a title to publish';
      }
      const nested = publishBlockIssues(block.content.blocks);
      if (nested) return nested;
    }
    if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        const nested = publishBlockIssues(col.blocks);
        if (nested) return nested;
      }
    }
    if (block.block_type === 'tabs') {
      for (const panel of block.content.tabs) {
        if (panel.label.trim().length === 0) {
          return 'Tabs blocks need a label on every tab to publish';
        }
        const nested = publishBlockIssues(panel.blocks);
        if (nested) return nested;
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
