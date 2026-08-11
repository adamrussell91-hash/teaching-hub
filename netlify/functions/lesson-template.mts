import { getContentStore, getJSON, lessonTemplateKey, setJSON } from './_shared/blobs.mts';
import { slugify } from './_shared/create-helpers.mts';
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
import { LessonTemplateSchema, StatusSchema, type LessonTemplate } from '../../src/schemas';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return withCors(methodNotAllowed('GET, PATCH, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(400, 'validation_error', 'Lesson template id is required'), request, env);
  }

  const store = getContentStore();
  const raw = await getJSON<LessonTemplate>(store, lessonTemplateKey(id));
  if (!raw) {
    return withCors(errorResponse(404, 'not_found', 'Lesson template not found'), request, env);
  }

  const existing = LessonTemplateSchema.safeParse(raw);
  if (!existing.success) {
    return withCors(errorResponse(500, 'invalid_data', 'Stored lesson template is invalid'), request, env);
  }

  if (request.method === 'GET') {
    return withCors(okResponse(200, existing.data), request, env);
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
  const next = { ...existing.data };
  if (typeof record.title === 'string') {
    const title = record.title.trim();
    if (!title) {
      return withCors(errorResponse(400, 'validation_error', 'title must not be empty'), request, env);
    }
    next.title = title;
    next.slug = slugify(title);
  }
  if (record.status !== undefined) {
    const status = StatusSchema.safeParse(record.status);
    if (!status.success) {
      return withCors(errorResponse(400, 'validation_error', 'status is invalid'), request, env);
    }
    next.status = status.data;
  }
  next.updated_at = new Date().toISOString();

  const validated = LessonTemplateSchema.safeParse(next);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Lesson template is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, lessonTemplateKey(id), validated.data);
  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/lesson-templates/:id' };
