import {
  buildArchiveExport,
  buildLessonExport,
  buildUnitExport
} from '../../src/export/portable';
import type { Lesson } from '../../src/schemas/lesson';
import type { Unit } from '../../src/schemas/unit';
import {
  draftLessonKey,
  getContentStore,
  getJSON,
  scheduleAnchorKey,
  unitKey
} from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';

const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

type ContentStore = ReturnType<typeof getContentStore>;

async function listEntries<T>(store: ContentStore, prefix: string): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const entries: (T | null)[] = await Promise.all(blobs.map((blob) => getJSON<T>(store, blob.key)));
  return entries.filter((entry): entry is T => entry !== null);
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const id = url.searchParams.get('id');
  const createdAt = new Date().toISOString();
  const store = getContentStore();

  if (kind === 'lesson') {
    if (!id) {
      return withCors(errorResponse(400, 'validation_error', 'id is required'), request, env);
    }
    const lesson = await getJSON<Lesson>(store, draftLessonKey(id));
    if (!lesson) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
    }
    return withCors(okResponse(200, buildLessonExport(lesson, createdAt)), request, env);
  }

  if (kind === 'unit') {
    if (!id) {
      return withCors(errorResponse(400, 'validation_error', 'id is required'), request, env);
    }
    const unit = await getJSON<Unit>(store, unitKey(id));
    if (!unit) {
      return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
    }
    const lessons = (
      await Promise.all(unit.lesson_ids.map((lessonId) => getJSON<Lesson>(store, draftLessonKey(lessonId))))
    ).filter((row): row is Lesson => row !== null);
    return withCors(okResponse(200, buildUnitExport(unit, lessons, createdAt)), request, env);
  }

  if (kind === 'archive') {
    const [
      years,
      subjects,
      units,
      lessons,
      classes,
      scheduled_lessons,
      scope_sequences,
      media,
      compositions,
      lesson_templates,
      unit_templates,
      anchor
    ] = await Promise.all([
      listEntries(store, 'years/'),
      listEntries(store, 'subjects/'),
      listEntries(store, 'units/'),
      listEntries<Lesson>(store, 'lessons/'),
      listEntries(store, 'classes/'),
      listEntries(store, 'scheduled_lessons/'),
      listEntries(store, 'scope_sequences/'),
      listEntries(store, 'media/'),
      listEntries(store, 'templates/compositions/'),
      listEntries(store, 'templates/lessons/'),
      listEntries(store, 'templates/units/'),
      getJSON<{ date: string }>(store, scheduleAnchorKey())
    ]);

    return withCors(
      okResponse(
        200,
        buildArchiveExport(
          {
            years,
            subjects,
            units,
            lessons,
            classes,
            scheduled_lessons,
            scope_sequences,
            media,
            compositions,
            lesson_templates,
            unit_templates,
            schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
          },
          createdAt
        )
      ),
      request,
      env
    );
  }

  return withCors(
    errorResponse(400, 'validation_error', 'kind must be lesson, unit, or archive'),
    request,
    env
  );
}

export const config = { path: '/api/export' };
