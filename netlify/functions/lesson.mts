import { draftLessonKey, getContentStore, getJSON, setJSON } from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import { validateLessonDraft } from './_shared/validate.mts';
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

  const candidate = {
    ...(body as Record<string, unknown>),
    id,
    updated_at: new Date().toISOString()
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
  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/lessons/:id' };
