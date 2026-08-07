import { z } from 'zod';
import { IsoDateSchema } from './common';
import { BlockSchema } from './block';
import { PublishableLessonSchema, type Lesson } from './lesson';

export const PublishedLessonSchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1),
  unit_id: z.string().min(1),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema,
  schema_version: z.literal(1)
});

export type PublishedLesson = z.infer<typeof PublishedLessonSchema>;

export function toPublishedLesson(
  lesson: Lesson,
  publishedAt: string
): PublishedLesson {
  PublishableLessonSchema.parse(lesson);
  return PublishedLessonSchema.parse({
    lesson_id: lesson.id,
    title: lesson.title,
    unit_id: lesson.unit_id,
    blocks: lesson.blocks,
    published_at: publishedAt,
    schema_version: 1
  });
}

export { PublishableLessonSchema };
