import { AiJobCreateSchema, type AiJob } from '../../src/ai/jobs.ts';
import { newId } from './_shared/create-helpers.mts';
import { aiJobKey, draftLessonKey, getContentStore, getJSON, setJSON } from './_shared/blobs.mts';
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
import type { Lesson } from '../../src/schemas/lesson.ts';

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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  const parsed = AiJobCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Invalid AI job request', parsed.error.flatten()),
      request,
      env
    );
  }

  const body = parsed.data;
  const store = getContentStore();
  const lesson = await getJSON<Lesson>(store, draftLessonKey(body.lesson_id));
  if (!lesson) {
    return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
  }

  const now = new Date().toISOString();
  const id = newId('ai_job');
  const job: AiJob = {
    id,
    lesson_id: body.lesson_id,
    agent: body.agent,
    status: 'working',
    snapshot_at: now,
    message: body.message,
    created_at: now
  };
  await setJSON(store, aiJobKey(id), job);

  return withCors(okResponse(202, { id, status: 'working' }), request, env);
}

export const config = { path: '/api/ai/jobs' };
