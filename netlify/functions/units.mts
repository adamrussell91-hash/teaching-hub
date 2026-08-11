import {
  getContentStore,
  getJSON,
  setJSON,
  subjectKey,
  unitKey,
  yearKey
} from './_shared/blobs.mts';
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
import { SubjectSchema, UnitSchema, type Unit } from '../../src/schemas';

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
  const year_id = typeof record.year_id === 'string' ? record.year_id : '';
  const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
  const description =
    typeof record.description === 'string' ? record.description : undefined;

  if (!title || !year_id || !subject_id) {
    return withCors(
      errorResponse(400, 'validation_error', 'title, year_id, and subject_id are required'),
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
  const id = newId('unit');
  const candidate: Unit = {
    id,
    type: 'unit',
    title,
    slug: slugify(title),
    year_id,
    subject_id,
    lesson_ids: [],
    description,
    blocks: Array.isArray(record.blocks) ? (record.blocks as Unit['blocks']) : undefined,
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = UnitSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Unit data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  const subjectParsed = SubjectSchema.safeParse(rawSubject);
  if (!subjectParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Subject data is invalid'), request, env);
  }

  const updatedSubject = SubjectSchema.safeParse({
    ...subjectParsed.data,
    unit_ids: [...subjectParsed.data.unit_ids, id],
    updated_at: timestamp
  });
  if (!updatedSubject.success) {
    return withCors(errorResponse(400, 'validation_error', 'Subject data is invalid'), request, env);
  }

  await setJSON(store, unitKey(id), validated.data);
  await setJSON(store, subjectKey(subject_id), updatedSubject.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/units' };
