import {
  compositionKey,
  getContentStore,
  getJSON,
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
  CompositionTemplateSchema,
  SectionBlockSchema,
  type CompositionSummary,
  type CompositionTemplate
} from '../../src/schemas';

const COMPOSITION_PREFIX = 'templates/compositions/';

type ContentStore = ReturnType<typeof getContentStore>;

async function listCompositions(store: ContentStore): Promise<CompositionSummary[]> {
  const { blobs } = await store.list({ prefix: COMPOSITION_PREFIX });
  const entries = await Promise.all(
    blobs.map((blob) => getJSON<CompositionTemplate>(store, blob.key))
  );

  return entries
    .filter((entry): entry is CompositionTemplate => {
      if (!entry) return false;
      const parsed = CompositionTemplateSchema.safeParse(entry);
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
    const compositions = await listCompositions(store);
    return withCors(okResponse(200, { compositions }), request, env);
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

  const rootParsed = SectionBlockSchema.safeParse(record.root);
  if (!rootParsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'root must be a section block', rootParsed.error.flatten()),
      request,
      env
    );
  }

  const timestamp = new Date().toISOString();
  const id = newId('composition');
  const candidate: CompositionTemplate = {
    id,
    type: 'composition_template',
    title,
    slug: slugify(title),
    status: 'active',
    root: structuredClone(rootParsed.data),
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const validated = CompositionTemplateSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Composition data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, compositionKey(id), validated.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/compositions' };
