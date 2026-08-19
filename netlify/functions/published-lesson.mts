import {
  getContentStore,
  getJSON,
  outcomeKey,
  publishedLessonKey
} from './_shared/blobs.mts';
import { errorResponse, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';
import { CurriculumOutcomeSchema } from '../../src/schemas/outcome';
import { toPublicOutcome } from '../../src/curriculum/outcome-catalog';
import { attachedOutcomeIds } from '../../src/curriculum/outcome-ids';

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

  const store = getContentStore();
  const snapshot = await getJSON<Record<string, unknown>>(store, publishedLessonKey(id));
  if (!snapshot) return withCors(errorResponse(404, 'not_found', 'Lesson is not published'), request, env);

  const ids = attachedOutcomeIds({
    outcome_ids: Array.isArray(snapshot.outcome_ids)
      ? snapshot.outcome_ids.filter((row): row is string => typeof row === 'string')
      : undefined
  });
  const outcomes = [];
  for (const outcomeId of ids) {
    const raw = await getJSON(store, outcomeKey(outcomeId));
    const parsed = CurriculumOutcomeSchema.safeParse(raw);
    if (parsed.success) outcomes.push(toPublicOutcome(parsed.data));
  }

  return withCors(okResponse(200, { ...snapshot, outcome_ids: ids, outcomes }), request, env);
}

export const config = { path: '/api/published/lessons/:id' };
