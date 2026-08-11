import { classKey, getContentStore, getJSON, setJSON, subjectKey, yearKey } from './_shared/blobs.mts';
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
import { ClassSchema, SubjectSchema, type Class } from '../../src/schemas';

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
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  const year_id = typeof record.year_id === 'string' ? record.year_id : '';
  const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
  const academic_year =
    typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
      ? record.academic_year
      : NaN;

  if (!title || !code || !year_id || !subject_id || !Number.isFinite(academic_year)) {
    return withCors(
      errorResponse(
        400,
        'validation_error',
        'title, code, academic_year, year_id, and subject_id are required'
      ),
      request,
      env
    );
  }

  const store = getContentStore();

  if (!(await getJSON(store, yearKey(year_id)))) {
    return withCors(errorResponse(404, 'not_found', 'Year not found'), request, env);
  }
  const rawSubject = await getJSON(store, subjectKey(subject_id));
  if (!rawSubject) {
    return withCors(errorResponse(404, 'not_found', 'Subject not found'), request, env);
  }

  const timestamp = new Date().toISOString();
  const id = newId('class');
  const candidate: Class = {
    id,
    type: 'class',
    title,
    slug: slugify(title),
    code,
    academic_year,
    year_id,
    subject_id,
    active_unit_ids: [],
    homepage: { announcements: [], resources: [], custom: [] },
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = ClassSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Class data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  const subjectParsed = SubjectSchema.safeParse(rawSubject);
  if (subjectParsed.success) {
    const classIds = subjectParsed.data.class_ids.includes(id)
      ? subjectParsed.data.class_ids
      : [...subjectParsed.data.class_ids, id];
    const updatedSubject = SubjectSchema.safeParse({
      ...subjectParsed.data,
      class_ids: classIds,
      updated_at: timestamp
    });
    if (updatedSubject.success) {
      await setJSON(store, subjectKey(subject_id), updatedSubject.data);
    }
  }

  await setJSON(store, classKey(id), validated.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/classes' };
