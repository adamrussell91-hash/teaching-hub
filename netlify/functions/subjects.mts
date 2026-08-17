import { getContentStore, getJSON, setJSON, subjectKey } from './_shared/blobs.mts';
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
import { SubjectSchema, type Subject } from '../../src/schemas';

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
  if (!title) {
    return withCors(errorResponse(400, 'validation_error', 'title is required'), request, env);
  }

  const store = getContentStore();
  const { blobs } = await store.list({ prefix: 'subjects/' });
  const existing = await Promise.all(blobs.map((blob) => getJSON<Subject>(store, blob.key)));
  const duplicate = existing.some(
    (subject) => subject && subject.title.toLowerCase() === title.toLowerCase()
  );
  if (duplicate) {
    return withCors(
      errorResponse(409, 'conflict', 'A subject with this title already exists'),
      request,
      env
    );
  }

  const timestamp = new Date().toISOString();
  const candidate: Subject = {
    id: newId('subject'),
    type: 'subject',
    title,
    display_title: title,
    slug: slugify(title),
    unit_ids: [],
    outcome_ids: [],
    class_ids: [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = SubjectSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Subject data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, subjectKey(validated.data.id), validated.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/subjects' };
