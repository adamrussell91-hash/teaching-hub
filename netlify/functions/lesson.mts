import { draftLessonKey, getContentStore, getJSON, setJSON, unitKey } from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import { validateLessonDraft, type Lesson } from './_shared/validate.mts';
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
  CHECKPOINT_AFTER_SAVE_WARNING,
  createNetlifyJsonStore,
  tryWriteCheckpoint
} from './_shared/versions.mts';
import type { VersionReason } from '../../src/schemas';
import { LessonSchema, UnitSchema } from '../../src/schemas';
import {
  applyLessonLibraryPatch,
  parseLessonLibraryPatch
} from '../../src/lessons/library-patch';
import {
  applyParsedStatus,
  handlePermanentDelete,
  LifecycleError,
  parseStatusPatch
} from './_shared/lifecycle-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);

  if (request.method === 'DELETE') {
    return handlePermanentDelete(request, context, 'lesson');
  }

  if (request.method !== 'GET' && request.method !== 'PUT' && request.method !== 'PATCH') {
    return withCors(methodNotAllowed('GET, PUT, PATCH, DELETE, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const store = getContentStore();

  if (request.method === 'GET') {
    const lesson = await getJSON(store, draftLessonKey(id));
    if (!lesson) return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
    return withCors(okResponse(200, lesson), request, env);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  if (request.method === 'PATCH') {
    const parsed = parseStatusPatch(body);
    if (!parsed.ok) {
      return withCors(errorResponse(400, parsed.code, parsed.message), request, env);
    }
    const library = parseLessonLibraryPatch(body);
    if (!library.ok) {
      return withCors(errorResponse(400, 'validation_error', library.message), request, env);
    }
    if (!parsed.hasStatus && !library.hasPatch) {
      return withCors(
        errorResponse(400, 'validation_error', 'Provide status or library fields'),
        request,
        env
      );
    }

    const existing = await getJSON(store, draftLessonKey(id));
    if (!existing) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
    }
    const existingParsed = LessonSchema.safeParse(existing);
    if (!existingParsed.success) {
      return withCors(errorResponse(500, 'invalid_data', 'Stored lesson is invalid'), request, env);
    }

    const nowIso = new Date().toISOString();
    try {
      let next = existingParsed.data;
      if (parsed.hasStatus) {
        next = applyParsedStatus(next, parsed, nowIso);
      }
      if (library.hasPatch) {
        const fromUnitId = next.unit_id;
        next = applyLessonLibraryPatch(next, library.patch);
        if (library.patch.unit_id && library.patch.unit_id !== fromUnitId) {
          const fromRaw = await getJSON(store, unitKey(fromUnitId));
          const toRaw = await getJSON(store, unitKey(library.patch.unit_id));
          const fromUnit = UnitSchema.safeParse(fromRaw);
          const toUnit = UnitSchema.safeParse(toRaw);
          if (!fromUnit.success || !toUnit.success) {
            return withCors(errorResponse(400, 'validation_error', 'Unit not found'), request, env);
          }
          await setJSON(store, unitKey(fromUnitId), {
            ...fromUnit.data,
            lesson_ids: fromUnit.data.lesson_ids.filter((entry) => entry !== id),
            updated_at: nowIso
          });
          if (!toUnit.data.lesson_ids.includes(id)) {
            await setJSON(store, unitKey(library.patch.unit_id), {
              ...toUnit.data,
              lesson_ids: [...toUnit.data.lesson_ids, id],
              updated_at: nowIso
            });
          }
        }
      }
      const validated = LessonSchema.safeParse({ ...next, updated_at: nowIso });
      if (!validated.success) {
        return withCors(
          errorResponse(400, 'validation_error', 'Lesson data is invalid', validated.error.flatten()),
          request,
          env
        );
      }
      await setJSON(store, draftLessonKey(id), validated.data);
      return withCors(okResponse(200, validated.data), request, env);
    } catch (err) {
      if (err instanceof LifecycleError) {
        return withCors(errorResponse(400, err.code, err.message), request, env);
      }
      throw err;
    }
  }

  if (typeof body !== 'object' || body === null) {
    return withCors(errorResponse(400, 'validation_error', 'Request body must be a JSON object'), request, env);
  }

  const bodyRecord = body as Record<string, unknown>;
  const checkpointReasonRaw = bodyRecord.checkpoint_reason;
  const { checkpoint_reason: _checkpointReason, ...bodyWithoutCheckpoint } = bodyRecord;
  void _checkpointReason;

  const existing = await getJSON<Lesson>(store, draftLessonKey(id));
  const candidate = {
    ...bodyWithoutCheckpoint,
    id,
    updated_at: new Date().toISOString(),
    published_at:
      bodyWithoutCheckpoint.published_at !== undefined
        ? bodyWithoutCheckpoint.published_at
        : existing && typeof existing === 'object' && 'published_at' in existing
          ? (existing as Lesson).published_at
          : undefined
  };

  const validated = validateLessonDraft(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Draft failed validation', validated.issues),
      request,
      env
    );
  }

  await setJSON(store, draftLessonKey(id), validated.data);

  let warning: string | undefined;
  if (checkpointReasonRaw === 'ai_accepted' || checkpointReasonRaw === 'manual_checkpoint') {
    const checkpointed = await tryWriteCheckpoint(createNetlifyJsonStore(store), {
      kind: 'lesson',
      parentId: id,
      snapshot: validated.data,
      reason: checkpointReasonRaw as VersionReason
    });
    if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
  }

  return withCors(
    okResponse(200, validated.data, {}, warning ? { warning } : undefined),
    request,
    env
  );
}

export const config = { path: '/api/lessons/:id' };
