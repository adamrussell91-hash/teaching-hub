import {
  getContentStore,
  getJSON,
  outcomeKey,
  setJSON,
  subjectKey
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
import { CurriculumOutcomeSchema, SubjectSchema, type CurriculumOutcome } from '../../src/schemas';

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
  const subjectId = typeof record.subject_id === 'string' ? record.subject_id.trim() : '';
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const group =
    typeof record.group === 'string' && record.group.trim() ? record.group.trim() : 'Custom';

  if (!subjectId || !code || !title || !description) {
    return withCors(
      errorResponse(400, 'validation_error', 'subject_id, code, title, and description are required'),
      request,
      env
    );
  }

  const store = getContentStore();
  const rawSubject = await getJSON(store, subjectKey(subjectId));
  const subjectParsed = SubjectSchema.safeParse(rawSubject);
  if (!subjectParsed.success) {
    return withCors(errorResponse(404, 'not_found', 'Subject not found'), request, env);
  }

  const { blobs } = await store.list({ prefix: 'outcomes/' });
  const existing = await Promise.all(
    blobs.map((blob) => getJSON<CurriculumOutcome>(store, blob.key))
  );
  const duplicate = existing.some(
    (row) =>
      row &&
      row.subject_id === subjectId &&
      row.code.toLowerCase() === code.toLowerCase()
  );
  if (duplicate) {
    return withCors(
      errorResponse(409, 'conflict', 'An outcome with this code already exists for the subject'),
      request,
      env
    );
  }

  const now = new Date().toISOString();
  const candidate: CurriculumOutcome = {
    id: newId('outcome'),
    type: 'curriculum_outcome',
    source: 'custom',
    title,
    slug: slugify(code),
    status: 'active',
    created_at: now,
    updated_at: now,
    schema_version: 1,
    code,
    description,
    group,
    subject_id: subjectId
  };

  const validated = CurriculumOutcomeSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Outcome data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  const subject = {
    ...subjectParsed.data,
    outcome_ids: [...subjectParsed.data.outcome_ids, validated.data.id],
    updated_at: now
  };
  const subjectOut = SubjectSchema.safeParse(subject);
  if (!subjectOut.success) {
    return withCors(errorResponse(400, 'validation_error', 'Subject data is invalid'), request, env);
  }

  await setJSON(store, outcomeKey(validated.data.id), validated.data);
  await setJSON(store, subjectKey(subjectId), subjectOut.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/outcomes' };
