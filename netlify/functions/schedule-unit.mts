import {
  classKey,
  getContentStore,
  getJSON,
  scheduledLessonKey,
  setJSON,
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
import { ClassSchema, UnitSchema, type ScheduledLesson } from '../../src/schemas';
import { applyScheduleUnit } from '../../src/schedule/schedule-unit';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ContentStore = ReturnType<typeof getContentStore>;

async function listScheduledForClass(
  store: ContentStore,
  classId: string
): Promise<ScheduledLesson[]> {
  const { blobs } = await store.list({ prefix: 'scheduled_lessons/' });
  const entries = await Promise.all(
    blobs.map((blob) => getJSON<ScheduledLesson>(store, blob.key))
  );
  return entries.filter(
    (entry): entry is ScheduledLesson =>
      entry !== null && entry.class_id === classId
  );
}

function parseBody(body: unknown):
  | { ok: true; unit_id: string; start_date: string; meeting_days?: number[] }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  const unit_id = record.unit_id;
  const start_date = record.start_date;

  if (typeof unit_id !== 'string' || !unit_id) {
    return { ok: false, code: 'validation_error', message: 'unit_id is required' };
  }
  if (typeof start_date !== 'string' || !DATE_RE.test(start_date)) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'start_date must be YYYY-MM-DD'
    };
  }

  if (record.meeting_days === undefined) {
    return { ok: true, unit_id, start_date };
  }

  if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'meeting_days must be a non-empty array when provided'
    };
  }

  const meeting_days: number[] = [];
  for (const day of record.meeting_days) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'meeting_days must contain integers from 1 to 7'
      };
    }
    meeting_days.push(day);
  }

  return { ok: true, unit_id, start_date, meeting_days };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const classId = context.params.classId;
  if (!classId) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }
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

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return withCors(errorResponse(400, parsed.code, parsed.message), request, env);
  }

  const store = getContentStore();
  const rawClass = await getJSON(store, classKey(classId));
  if (!rawClass) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }
  const classParsed = ClassSchema.safeParse(rawClass);
  if (!classParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Class data is invalid'), request, env);
  }

  const rawUnit = await getJSON(store, unitKey(parsed.unit_id));
  if (!rawUnit) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }
  const unitParsed = UnitSchema.safeParse(rawUnit);
  if (!unitParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  if (unitParsed.data.subject_id !== classParsed.data.subject_id) {
    return withCors(
      errorResponse(400, 'subject_mismatch', 'Unit subject does not match class subject'),
      request,
      env
    );
  }

  if (unitParsed.data.lesson_ids.length === 0) {
    return withCors(errorResponse(400, 'no_lessons', 'Unit has no lessons'), request, env);
  }

  const meetingDays =
    parsed.meeting_days ?? classParsed.data.meeting_days ?? [1, 2, 3, 4, 5];

  const existing = await listScheduledForClass(store, classId);
  const nowIso = new Date().toISOString();
  const idFactory = (lessonId: string) => `scheduled_${classId}_${lessonId}`;

  const result = applyScheduleUnit({
    cls: classParsed.data,
    unit: unitParsed.data,
    existing,
    startDate: parsed.start_date,
    meetingDays,
    nowIso,
    idFactory
  });

  if (!result.ok) {
    return withCors(errorResponse(400, result.code, result.message), request, env);
  }

  for (const created of result.created) {
    const key = scheduledLessonKey(created.id);
    const collision = await getJSON(store, key);
    if (collision) {
      return withCors(
        errorResponse(409, 'conflict', `Scheduled lesson id already exists: ${created.id}`),
        request,
        env
      );
    }
  }

  await setJSON(store, classKey(classId), result.class);
  for (const created of result.created) {
    await setJSON(store, scheduledLessonKey(created.id), created);
  }

  return withCors(
    okResponse(200, { class: result.class, scheduled_lessons: result.created }),
    request,
    env
  );
}

export const config = { path: '/api/classes/:classId/schedule-unit' };
