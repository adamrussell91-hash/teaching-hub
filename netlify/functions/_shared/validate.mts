import type { ZodIssue } from 'zod';
import {
  LessonSchema,
  PublishableLessonSchema,
  PublishedLessonSchema,
  toPublishedLesson,
  type Lesson,
  type PublishedLesson
} from '../../../src/schemas';

// Re-exported so function handlers validate lesson data with the exact same
// Zod schemas the client and dev mock API use — no drift between draft
// validation rules in the browser, the mock server, and the deployed functions.
export { LessonSchema, PublishableLessonSchema, PublishedLessonSchema, toPublishedLesson };
export type { Lesson, PublishedLesson };

export type ValidationResult<T> = { success: true; data: T } | { success: false; issues: ZodIssue[] };

export function validateLessonDraft(candidate: unknown): ValidationResult<Lesson> {
  const parsed = LessonSchema.safeParse(candidate);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, issues: parsed.error.issues };
}

export function validatePublishableLesson(candidate: unknown): ValidationResult<Lesson> {
  const parsed = PublishableLessonSchema.safeParse(candidate);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, issues: parsed.error.issues };
}
