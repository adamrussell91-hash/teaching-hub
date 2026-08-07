import { getContentStore, getJSON, publishedLessonKey } from './_shared/blobs.mts';
import { errorResponse, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

/**
 * Public route: no session or origin check. Anyone with a lesson ID can read
 * its published snapshot — draft keys are never touched here, so there is
 * no risk of leaking teacher-only content or unpublished edits.
 */
export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) return withCors(errorResponse(404, 'not_found', 'Lesson is not published'), request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const snapshot = await getJSON(getContentStore(), publishedLessonKey(id));
  if (!snapshot) return withCors(errorResponse(404, 'not_found', 'Lesson is not published'), request, env);

  return withCors(okResponse(200, snapshot), request, env);
}

export const config = { path: '/api/published/lessons/:id' };
