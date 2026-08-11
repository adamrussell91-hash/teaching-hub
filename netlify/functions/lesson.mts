import { draftLessonKey, getContentStore, getJSON, setJSON } from './_shared/blobs.mts';
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

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
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
