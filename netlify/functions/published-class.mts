import {
  classKey,
  draftLessonKey,
  getContentStore,
  getJSON,
  unitKey
} from './_shared/blobs.mts';
import { errorResponse, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';
import { ClassSchema, ScheduledLessonSchema, UnitSchema, type ScheduledLesson, type Unit } from '../../src/schemas';
import { buildPublishedClass } from '../../src/schedule/build-published-class';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

const SCHEDULED_LESSON_PREFIX = 'scheduled_lessons/';
const PUBLISHED_LESSON_PREFIX = 'published/lessons/';

/**
 * Public route: no session or origin check. Returns a student-safe class DTO
 * with homepage regions, schedule context, and resolved titles.
 */
export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }
  if (request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
  }

  const store = getContentStore();
  const rawClass = await getJSON(store, classKey(id));
  if (!rawClass) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }

  const classParsed = ClassSchema.safeParse(rawClass);
  if (!classParsed.success || classParsed.data.status !== 'active') {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }

  const cls = classParsed.data;

  const { blobs: scheduledBlobs } = await store.list({ prefix: SCHEDULED_LESSON_PREFIX });
  const scheduledRows = await Promise.all(
    scheduledBlobs.map((blob) => getJSON(store, blob.key))
  );

  const scheduled: ScheduledLesson[] = [];
  for (const row of scheduledRows) {
    const parsed = ScheduledLessonSchema.safeParse(row);
    if (parsed.success && parsed.data.class_id === id) {
      scheduled.push(parsed.data);
    }
  }

  const unitIds = new Set<string>(cls.active_unit_ids);
  for (const row of scheduled) {
    unitIds.add(row.unit_id);
  }
  if (cls.current_unit_id) {
    unitIds.add(cls.current_unit_id);
  }

  const units: Unit[] = [];
  for (const unitId of unitIds) {
    const rawUnit = await getJSON(store, unitKey(unitId));
    const parsed = UnitSchema.safeParse(rawUnit);
    if (parsed.success) {
      units.push(parsed.data);
    }
  }

  const lessonIds = new Set<string>();
  for (const row of scheduled) {
    lessonIds.add(row.lesson_id);
  }

  const lessons: Array<{ id: string; title: string }> = [];
  for (const lessonId of lessonIds) {
    const rawLesson = await getJSON<{ id?: string; title?: string }>(
      store,
      draftLessonKey(lessonId)
    );
    if (rawLesson && typeof rawLesson.title === 'string' && rawLesson.title) {
      lessons.push({ id: lessonId, title: rawLesson.title });
    }
  }

  const { blobs: publishedBlobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
  const publishedLessonIds = new Set<string>();
  for (const blob of publishedBlobs) {
    const lessonId = blob.key.slice(PUBLISHED_LESSON_PREFIX.length);
    if (lessonId) {
      publishedLessonIds.add(lessonId);
    }
  }

  const dto = buildPublishedClass({
    cls,
    units,
    lessons,
    scheduled,
    publishedLessonIds
  });

  return withCors(okResponse(200, dto), request, env);
}

export const config = { path: '/api/published/classes/:id' };
