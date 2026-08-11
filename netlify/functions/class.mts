import {
  classKey,
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
import {
  ClassHomepageSchema,
  ClassSchema,
  ScheduledLessonSchema,
  type Class,
  type ClassHomepage
} from '../../src/schemas';
import {
  CHECKPOINT_AFTER_SAVE_WARNING,
  createNetlifyJsonStore,
  tryWriteCheckpoint
} from './_shared/versions.mts';
import {
  applyParsedStatus,
  handlePermanentDelete,
  LifecycleError,
  parseStatusPatch
} from './_shared/lifecycle-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function parseBody(
  body: unknown
):
  | {
      ok: true;
      meeting_days?: number[];
      current_scheduled_lesson_id?: string | null;
      homepage?: ClassHomepage;
      status?: Class['status'];
      trash_reason?: string;
    }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  const hasMeetingDays = record.meeting_days !== undefined;
  const hasCurrent = record.current_scheduled_lesson_id !== undefined;
  const hasHomepage = record.homepage !== undefined;
  const statusPatch = parseStatusPatch(body);
  if (!statusPatch.ok) {
    return { ok: false, code: statusPatch.code, message: statusPatch.message };
  }
  const hasStatus = statusPatch.hasStatus;

  if (!hasMeetingDays && !hasCurrent && !hasHomepage && !hasStatus) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Provide meeting_days, current_scheduled_lesson_id, homepage, and/or status'
    };
  }

  let meeting_days: number[] | undefined;
  if (hasMeetingDays) {
    if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'meeting_days must be a non-empty array when provided'
      };
    }

    meeting_days = [];
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
  }

  let current_scheduled_lesson_id: string | null | undefined;
  if (hasCurrent) {
    const value = record.current_scheduled_lesson_id;
    if (value === null) {
      current_scheduled_lesson_id = null;
    } else if (typeof value === 'string' && value) {
      current_scheduled_lesson_id = value;
    } else {
      return {
        ok: false,
        code: 'validation_error',
        message: 'current_scheduled_lesson_id must be a non-empty string or null'
      };
    }
  }

  let homepage: ClassHomepage | undefined;
  if (hasHomepage) {
    const homepageParsed = ClassHomepageSchema.safeParse(record.homepage);
    if (!homepageParsed.success) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'homepage is invalid'
      };
    }
    homepage = homepageParsed.data;
  }

  return {
    ok: true,
    meeting_days,
    current_scheduled_lesson_id,
    homepage,
    status: statusPatch.status,
    trash_reason: statusPatch.trash_reason
  };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }

  if (request.method === 'DELETE') {
    return handlePermanentDelete(request, context, 'class');
  }

  if (request.method !== 'PATCH') {
    return withCors(methodNotAllowed('PATCH, DELETE, OPTIONS'), request, env);
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
  const rawClass = await getJSON(store, classKey(id));
  if (!rawClass) {
    return withCors(errorResponse(404, 'not_found', 'Class not found'), request, env);
  }

  const classParsed = ClassSchema.safeParse(rawClass);
  if (!classParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Class data is invalid'), request, env);
  }

  if (parsed.current_scheduled_lesson_id) {
    const scheduled = await getJSON(store, scheduledLessonKey(parsed.current_scheduled_lesson_id));
    if (!scheduled) {
      return withCors(
        errorResponse(404, 'not_found', 'Scheduled lesson not found'),
        request,
        env
      );
    }
    const scheduledParsed = ScheduledLessonSchema.safeParse(scheduled);
    if (!scheduledParsed.success || scheduledParsed.data.class_id !== id) {
      return withCors(
        errorResponse(404, 'not_found', 'Scheduled lesson not found'),
        request,
        env
      );
    }
  }

  const nowIso = new Date().toISOString();
  let merged: Record<string, unknown> = {
    ...classParsed.data,
    updated_at: nowIso
  };

  if (parsed.meeting_days !== undefined) {
    merged.meeting_days = parsed.meeting_days;
  }

  if (parsed.current_scheduled_lesson_id !== undefined) {
    if (parsed.current_scheduled_lesson_id === null) {
      delete merged.current_scheduled_lesson_id;
    } else {
      merged.current_scheduled_lesson_id = parsed.current_scheduled_lesson_id;
    }
  }

  if (parsed.homepage !== undefined) {
    merged.homepage = parsed.homepage;
  }

  if (parsed.status !== undefined) {
    try {
      merged = applyParsedStatus(merged as Class, parsed, nowIso) as Record<string, unknown>;
      merged.updated_at = nowIso;
    } catch (err) {
      if (err instanceof LifecycleError) {
        return withCors(errorResponse(400, err.code, err.message), request, env);
      }
      throw err;
    }
  }

  const validated = ClassSchema.safeParse(merged);
  if (!validated.success) {
    return withCors(errorResponse(400, 'validation_error', 'Class data is invalid'), request, env);
  }

  await setJSON(store, classKey(id), validated.data);

  let warning: string | undefined;
  if (parsed.homepage !== undefined) {
    const checkpointed = await tryWriteCheckpoint(createNetlifyJsonStore(store), {
      kind: 'class_homepage',
      parentId: id,
      snapshot: { homepage: validated.data.homepage },
      reason: 'save',
      now: nowIso
    });
    if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
  }

  return withCors(
    okResponse(200, validated.data, {}, warning ? { warning } : undefined),
    request,
    env
  );
}

export const config = { path: '/api/classes/:id' };
