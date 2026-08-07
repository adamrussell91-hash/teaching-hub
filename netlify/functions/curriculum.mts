import { getContentStore, getJSON } from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import type { Lesson } from './_shared/validate.mts';
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

interface CurriculumLessonSummary {
  id: string;
  title: string;
  slug: string;
  unit_id: string;
  sequence: number;
  status: string;
  published: boolean;
}

const DRAFT_LESSON_PREFIX = 'lessons/';
const PUBLISHED_LESSON_PREFIX = 'published/lessons/';

type ContentStore = ReturnType<typeof getContentStore>;

async function listEntries<T>(store: ContentStore, prefix: string): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const entries: (T | null)[] = await Promise.all(blobs.map((blob) => getJSON<T>(store, blob.key)));
  return entries.filter((entry): entry is T => entry !== null);
}

/**
 * Builds the curriculum tree by listing whatever content already exists in
 * Blobs — it never seeds data itself. Run `scripts/seed-blobs.mjs` once
 * against a fresh site before the first curriculum GET.
 */
async function buildCurriculum(store: ContentStore) {
  const [years, subjects, units, lessons, publishedList] = await Promise.all([
    listEntries<Record<string, unknown>>(store, 'years/'),
    listEntries<Record<string, unknown>>(store, 'subjects/'),
    listEntries<Record<string, unknown>>(store, 'units/'),
    listEntries<Lesson>(store, DRAFT_LESSON_PREFIX),
    store.list({ prefix: PUBLISHED_LESSON_PREFIX })
  ]);

  const publishedIds = new Set(publishedList.blobs.map((blob) => blob.key.slice(PUBLISHED_LESSON_PREFIX.length)));

  const lessonSummaries: CurriculumLessonSummary[] = lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    slug: lesson.slug,
    unit_id: lesson.unit_id,
    sequence: lesson.sequence,
    status: lesson.status,
    published: publishedIds.has(lesson.id)
  }));

  return { years, subjects, units, lessons: lessonSummaries };
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

  const curriculum = await buildCurriculum(getContentStore());
  return withCors(okResponse(200, curriculum), request, env);
}

export const config = { path: '/api/curriculum' };
