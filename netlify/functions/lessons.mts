import {
  draftLessonKey,
  getContentStore,
  getJSON,
  setJSON,
  unitKey
} from './_shared/blobs.mts';
import { newId, slugify } from './_shared/create-helpers.mts';
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
import {
  DEFAULT_PEDAGOGICAL_MODE,
  isPedagogicalMode,
  LessonSchema,
  UnitSchema,
  type Lesson,
  type PedagogicalMode
} from '../../src/schemas';

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  if (typeof body !== 'object' || body === null) {
    return withCors(
      errorResponse(400, 'validation_error', 'Request body must be a JSON object'),
      request,
      env
    );
  }

  const record = body as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const unit_id = typeof record.unit_id === 'string' ? record.unit_id : '';
  let pedagogical_mode: PedagogicalMode = DEFAULT_PEDAGOGICAL_MODE;
  if (record.pedagogical_mode !== undefined) {
    if (!isPedagogicalMode(record.pedagogical_mode)) {
      return withCors(
        errorResponse(400, 'validation_error', 'pedagogical_mode is invalid'),
        request,
        env
      );
    }
    pedagogical_mode = record.pedagogical_mode;
  }

  if (!title || !unit_id) {
    return withCors(
      errorResponse(400, 'validation_error', 'title and unit_id are required'),
      request,
      env
    );
  }

  const store = getContentStore();
  const rawUnit = await getJSON(store, unitKey(unit_id));
  if (!rawUnit) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }

  const unitParsed = UnitSchema.safeParse(rawUnit);
  if (!unitParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  let maxSequence = 0;
  for (const lessonId of unitParsed.data.lesson_ids) {
    const lesson = await getJSON<Lesson>(store, draftLessonKey(lessonId));
    if (lesson && typeof lesson.sequence === 'number' && lesson.sequence > maxSequence) {
      maxSequence = lesson.sequence;
    }
  }

  const timestamp = new Date().toISOString();
  const id = newId('lesson');
  const candidate: Lesson = {
    id,
    type: 'lesson',
    title,
    slug: slugify(title),
    unit_id,
    sequence: maxSequence + 1,
    blocks: [],
    pedagogical_mode,
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = LessonSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Lesson data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  const updatedUnit = UnitSchema.safeParse({
    ...unitParsed.data,
    lesson_ids: [...unitParsed.data.lesson_ids, id],
    updated_at: timestamp
  });
  if (!updatedUnit.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  await setJSON(store, draftLessonKey(id), validated.data);
  await setJSON(store, unitKey(unit_id), updatedUnit.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/lessons' };
