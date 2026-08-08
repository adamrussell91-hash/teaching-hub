import {
  getContentStore,
  getJSON,
  scopeSequenceKey,
  setJSON,
  subjectKey
} from './_shared/blobs.mts';
import { defaultScopeTerms, newId, slugify } from './_shared/create-helpers.mts';
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
import { ScopeSequenceSchema, SubjectSchema, type ScopeSequence } from '../../src/schemas';

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
  const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
  const academic_year =
    typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
      ? record.academic_year
      : NaN;

  if (!title || !subject_id || !Number.isFinite(academic_year)) {
    return withCors(
      errorResponse(400, 'validation_error', 'title, subject_id, and academic_year are required'),
      request,
      env
    );
  }

  const store = getContentStore();
  const rawSubject = await getJSON(store, subjectKey(subject_id));
  if (!rawSubject) {
    return withCors(errorResponse(404, 'not_found', 'Subject not found'), request, env);
  }

  const subjectParsed = SubjectSchema.safeParse(rawSubject);
  if (!subjectParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Subject data is invalid'), request, env);
  }

  const week_count = 40;
  const timestamp = new Date().toISOString();
  const id = newId('scope');
  const candidate: ScopeSequence = {
    id,
    type: 'scope_sequence',
    title,
    slug: slugify(title),
    subject_id,
    academic_year,
    week_count,
    terms: defaultScopeTerms(week_count),
    timeline_items: [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = ScopeSequenceSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(
        400,
        'validation_error',
        'Scope sequence data is invalid',
        validated.error.flatten()
      ),
      request,
      env
    );
  }

  const updatedSubject = SubjectSchema.safeParse({
    ...subjectParsed.data,
    scope_id: id,
    updated_at: timestamp
  });
  if (!updatedSubject.success) {
    return withCors(errorResponse(400, 'validation_error', 'Subject data is invalid'), request, env);
  }

  await setJSON(store, scopeSequenceKey(id), validated.data);
  await setJSON(store, subjectKey(subject_id), updatedSubject.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/scope-sequences' };
