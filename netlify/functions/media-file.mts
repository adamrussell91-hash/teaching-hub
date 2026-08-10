import { getContentStore, getJSON, mediaFileKey, mediaKey } from './_shared/blobs.mts';
import {
  errorResponse,
  methodNotAllowed,
  preflightResponse,
  withCors
} from './_shared/http.mts';
import { MediaSchema } from '../../src/schemas';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

/**
 * Public route: serves uploaded media bytes without a teacher session.
 * Archived / missing media returns 404.
 */
export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
  }

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Media file not found'), request, env);
  }

  const store = getContentStore();
  const raw = await getJSON(store, mediaKey(id));
  if (!raw) {
    return withCors(errorResponse(404, 'not_found', 'Media file not found'), request, env);
  }

  const parsed = MediaSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status !== 'active') {
    return withCors(errorResponse(404, 'not_found', 'Media file not found'), request, env);
  }

  const result = await store.getWithMetadata(mediaFileKey(id), { type: 'arrayBuffer' });
  if (!result || !result.data) {
    return withCors(errorResponse(404, 'not_found', 'Media file not found'), request, env);
  }

  const contentType =
    parsed.data.mime_type ||
    (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null) ||
    'application/octet-stream';

  return withCors(
    new Response(result.data, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400'
      }
    }),
    request,
    env
  );
}

export const config = { path: '/api/media/:id/file' };
