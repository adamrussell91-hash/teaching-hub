import { getContentStore, getJSON, outcomeKey, unitKey } from './_shared/blobs.mts';
import { errorResponse, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';
import { filterBlocksForStudent } from '../../src/blocks/visibility';
import { sanitizeBlocksDeep } from '../../src/blocks/sanitize-blocks';
import {
  orderLessonsByUnitIds,
  UnitSchema,
  type PublishedUnitLessonSummary
} from '../../src/schemas';
import { CurriculumOutcomeSchema } from '../../src/schemas/outcome';
import { toPublicOutcome } from '../../src/curriculum/outcome-catalog';
import { attachedOutcomeIds } from '../../src/curriculum/outcome-ids';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

interface UnitBlob {
  title?: string;
  lesson_ids?: string[];
  cover?: unknown;
  blocks?: unknown;
  id?: string;
  type?: string;
  slug?: string;
  year_id?: string;
  subject_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  schema_version?: number;
  outcome_ids?: string[];
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

  const unitParsed = UnitSchema.safeParse({
    id,
    type: 'unit',
    title: unit.title,
    slug: unit.slug ?? 'published',
    year_id: unit.year_id ?? 'year',
    subject_id: unit.subject_id ?? 'subject',
    lesson_ids: unit.lesson_ids ?? [],
    blocks: unit.blocks ?? [],
    cover: unit.cover,
    status: unit.status ?? 'active',
    created_at: unit.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: unit.updated_at ?? '2026-01-01T00:00:00.000Z',
    schema_version: unit.schema_version ?? 1
  });

  const studentBlocks = sanitizeBlocksDeep(
    filterBlocksForStudent(unitParsed.success ? (unitParsed.data.blocks ?? []) : [])
  );

  const ids = attachedOutcomeIds({ outcome_ids: unit.outcome_ids });
  const outcomes = [];
  for (const outcomeId of ids) {
    const raw = await getJSON(store, outcomeKey(outcomeId));
    const parsed = CurriculumOutcomeSchema.safeParse(raw);
    if (parsed.success) outcomes.push(toPublicOutcome(parsed.data));
  }

  return withCors(
    okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons,
      ...(unitParsed.success && unitParsed.data.cover
        ? { cover: unitParsed.data.cover }
        : {}),
      blocks: studentBlocks,
      outcome_ids: ids,
      outcomes
    }),
    request,
    env
  );
}

export const config = { path: '/api/published/units/:id' };
