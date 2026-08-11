import { compositionKey, getContentStore, getJSON, setJSON } from './_shared/blobs.mts';
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
import {
  CompositionTemplateSchema,
  SectionBlockSchema,
  type CompositionTemplate
} from '../../src/schemas';

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
    return withCors(errorResponse(400, 'validation_error', 'Composition id is required'), request, env);
  }

  const store = getContentStore();
  const raw = await getJSON<CompositionTemplate>(store, compositionKey(id));
  if (!raw) {
    return withCors(errorResponse(404, 'not_found', 'Composition not found'), request, env);
  }

  const existing = CompositionTemplateSchema.safeParse(raw);
  if (!existing.success) {
    return withCors(errorResponse(500, 'invalid_data', 'Stored composition is invalid'), request, env);
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
  const hasTitle = typeof record.title === 'string';
  const hasRoot = record.root !== undefined;
  if (!hasTitle && !hasRoot) {
    return withCors(
      errorResponse(400, 'validation_error', 'At least one of title or root is required'),
      request,
      env
    );
  }

  const next = { ...existing.data };

  if (hasTitle) {
    const title = (record.title as string).trim();
    if (!title) {
      return withCors(errorResponse(400, 'validation_error', 'title must not be empty'), request, env);
    }
    next.title = title;
    next.slug = slugify(title);
  }

  if (hasRoot) {
    const rootParsed = SectionBlockSchema.safeParse(record.root);
    if (!rootParsed.success) {
      return withCors(
        errorResponse(
          400,
          'validation_error',
          'root must be a section block',
          rootParsed.error.flatten()
        ),
        request,
        env
      );
    }
    if (rootParsed.data.content.link) {
      return withCors(
        errorResponse(400, 'validation_error', 'Composition root must not be a linked section'),
        request,
        env
      );
    }
    next.root = structuredClone(rootParsed.data);
  }

  next.updated_at = new Date().toISOString();

  const validated = CompositionTemplateSchema.safeParse(next);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Composition data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, compositionKey(id), validated.data);
  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/compositions/:id' };
