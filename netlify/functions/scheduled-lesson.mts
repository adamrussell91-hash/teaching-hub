import {
  getContentStore,
  getJSON,
  scheduledLessonKey,
  setJSON
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
import { ScheduledLessonSchema, type ScheduledLesson } from '../../src/schemas';
import { reorderScheduledLesson } from '../../src/schedule/reorder';

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
  return entries
    .filter(
      (entry): entry is ScheduledLesson =>
        entry !== null && entry.class_id === classId
    )
    .sort((a, b) => a.schedule_order - b.schedule_order);
}

function parseBody(
  body: unknown
):
  | { ok: true; date?: string; direction?: 'up' | 'down' }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  const hasDate = record.date !== undefined;
  const hasDirection = record.direction !== undefined;

  if (!hasDate && !hasDirection) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Provide date and/or direction'
    };
  }

  let date: string | undefined;
  if (hasDate) {
    if (typeof record.date !== 'string' || !DATE_RE.test(record.date)) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'date must be YYYY-MM-DD'
      };
    }
    date = record.date;
  }

  let direction: 'up' | 'down' | undefined;
  if (hasDirection) {
    if (record.direction !== 'up' && record.direction !== 'down') {
      return {
        ok: false,
        code: 'validation_error',
        message: "direction must be 'up' or 'down'"
      };
    }
    direction = record.direction;
  }

  return { ok: true, date, direction };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Scheduled lesson not found'), request, env);
  }
  if (request.method !== 'PATCH') {
    return withCors(methodNotAllowed('PATCH, OPTIONS'), request, env);
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
  const existing = await getJSON<ScheduledLesson>(store, scheduledLessonKey(id));
  if (!existing) {
    return withCors(errorResponse(404, 'not_found', 'Scheduled lesson not found'), request, env);
  }

  const nowIso = new Date().toISOString();
  let result: ScheduledLesson = { ...existing };
  const toPersist = new Map<string, ScheduledLesson>();

  if (parsed.date !== undefined) {
    result = { ...result, date: parsed.date, updated_at: nowIso };
    toPersist.set(id, result);
  }

  if (parsed.direction !== undefined) {
    const classRows = await listScheduledForClass(store, existing.class_id);
    const withTarget = classRows.map((row) => (row.id === id ? result : row));
    const reordered = reorderScheduledLesson(withTarget, id, parsed.direction);

    for (const row of reordered) {
      const before = withTarget.find((r) => r.id === row.id);
      if (!before || before.schedule_order === row.schedule_order) continue;
      const updated = { ...row, updated_at: nowIso };
      toPersist.set(updated.id, updated);
      if (updated.id === id) result = updated;
    }
  }

  const validated = ScheduledLessonSchema.safeParse(result);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid'),
      request,
      env
    );
  }

  toPersist.set(id, validated.data);

  for (const row of toPersist.values()) {
    const rowValidated = ScheduledLessonSchema.safeParse(row);
    if (!rowValidated.success) {
      return withCors(
        errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid'),
        request,
        env
      );
    }
    await setJSON(store, scheduledLessonKey(rowValidated.data.id), rowValidated.data);
  }

  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/scheduled-lessons/:id' };
