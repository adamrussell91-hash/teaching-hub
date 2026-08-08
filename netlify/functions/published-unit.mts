import { getContentStore, getJSON, unitKey } from './_shared/blobs.mts';
import { errorResponse, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';
import {
  orderLessonsByUnitIds,
  type PublishedUnitLessonSummary
} from '../../src/schemas/published-unit';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

interface UnitBlob {
  title?: string;
  lesson_ids?: string[];
}

interface PublishedLessonBlob {
  lesson_id?: string;
  title?: string;
  unit_id?: string;
}

const PUBLISHED_LESSON_PREFIX = 'published/lessons/';

/**
 * Public route: no session or origin check. Anyone with a unit ID can read
 * its published lesson summaries — draft keys are never touched here, so there
 * is no risk of leaking teacher-only content or unpublished edits.
 */
export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const store = getContentStore();
  const unit = await getJSON<UnitBlob>(store, unitKey(id));
  if (!unit || !unit.title) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }

  const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
  const snapshots = await Promise.all(
    blobs.map((blob) => getJSON<PublishedLessonBlob>(store, blob.key))
  );

  const matching: PublishedUnitLessonSummary[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot || snapshot.unit_id !== id) continue;
    if (!snapshot.lesson_id || !snapshot.title) continue;
    matching.push({ lesson_id: snapshot.lesson_id, title: snapshot.title });
  }

  const lessons = orderLessonsByUnitIds(unit.lesson_ids ?? [], matching);

  return withCors(
    okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons
    }),
    request,
    env
  );
}

export const config = { path: '/api/published/units/:id' };
