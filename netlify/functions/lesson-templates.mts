import {
  getContentStore,
  getJSON,
  lessonTemplateKey,
  setJSON
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
import {
  BlockSchema,
  LessonTemplateSchema,
  type LessonTemplate,
  type LessonTemplateSummary
} from '../../src/schemas';

const PREFIX = 'templates/lessons/';

type ContentStore = ReturnType<typeof getContentStore>;

async function listSummaries(store: ContentStore): Promise<LessonTemplateSummary[]> {
  const { blobs } = await store.list({ prefix: PREFIX });
  const entries = await Promise.all(
    blobs.map((blob) => getJSON<LessonTemplate>(store, blob.key))
  );
  return entries
    .filter((entry): entry is LessonTemplate => {
      if (!entry) return false;
      const parsed = LessonTemplateSchema.safeParse(entry);
      return parsed.success && parsed.data.status === 'active';
    })
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      updated_at: entry.updated_at
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
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
    return withCors(okResponse(200, { templates: await listSummaries(store) }), request, env);
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
  const blocksRaw = record.blocks;
  const blocksParsed = BlockSchema.array().safeParse(blocksRaw ?? []);
  if (!title || !blocksParsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'title and blocks[] are required'),
      request,
      env
    );
  }

  const timestamp = new Date().toISOString();
  const id = newId('lesson_template');
  const candidate: LessonTemplate = {
    id,
    type: 'lesson_template',
    title,
    slug: slugify(title),
    status: 'active',
    blocks: blocksParsed.data,
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = LessonTemplateSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Lesson template is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, lessonTemplateKey(id), validated.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/lesson-templates' };
