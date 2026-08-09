import { compositionKey, getContentStore, getJSON } from './_shared/blobs.mts';
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
import { CompositionTemplateSchema, type CompositionTemplate } from '../../src/schemas';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
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

  const raw = await getJSON<CompositionTemplate>(getContentStore(), compositionKey(id));
  if (!raw) {
    return withCors(errorResponse(404, 'not_found', 'Composition not found'), request, env);
  }

  const parsed = CompositionTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(errorResponse(500, 'invalid_data', 'Stored composition is invalid'), request, env);
  }

  return withCors(okResponse(200, parsed.data), request, env);
}

export const config = { path: '/api/compositions/:id' };
