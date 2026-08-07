import { z } from 'zod';
import { CommonFields, IsoDateSchema } from './common';
import { BlockSchema } from './block';

export const LessonSchema = z.object({
  ...CommonFields,
  type: z.literal('lesson'),
  unit_id: z.string().min(1),
  sequence: z.number().int(),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema.optional()
});

export const PublishableLessonSchema = LessonSchema.refine(
  (lesson) => lesson.title.trim().length > 0,
  { message: 'Title is required to publish', path: ['title'] }
);

export type Lesson = z.infer<typeof LessonSchema>;
