import type { Block, CompositionTemplate, Lesson, Unit } from '../../src/schemas';
import { runContentSearch } from '../../src/search/run-content-search';
import { getContentStore, getJSON } from './_shared/blobs.mts';
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

const DRAFT_LESSON_PREFIX = 'lessons/';
const UNIT_PREFIX = 'units/';
const COMPOSITION_PREFIX = 'templates/compositions/';

type ContentStore = ReturnType<typeof getContentStore>;

type UnitWithOptionalBlocks = Unit & { blocks?: Block[] };

async function listEntries<T>(store: ContentStore, prefix: string): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const entries: (T | null)[] = await Promise.all(blobs.map((blob) => getJSON<T>(store, blob.key)));
  return entries.filter((entry): entry is T => entry !== null);
}

async function buildCorpus(store: ContentStore) {
  const [lessons, units, compositions] = await Promise.all([
    listEntries<Lesson>(store, DRAFT_LESSON_PREFIX),
    listEntries<UnitWithOptionalBlocks>(store, UNIT_PREFIX),
    listEntries<CompositionTemplate>(store, COMPOSITION_PREFIX)
  ]);

  return {
    lessons: lessons.map((lesson) => ({ id: lesson.id, blocks: lesson.blocks ?? [] })),
    units: units.map((unit) => ({ id: unit.id, blocks: unit.blocks ?? [] })),
    compositions: compositions
      .filter((composition) => composition.status === 'active')
      .map((composition) => ({ id: composition.id, blocks: [composition.root] }))
  };
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const corpus = await buildCorpus(getContentStore());
  return withCors(okResponse(200, { hits: runContentSearch(q, corpus) }), request, env);
}

export const config = { path: '/api/search' };
