import { MediaSchema, SubjectSchema, type Media } from '../../src/schemas';
import { CurriculumOutcomeSchema, type CurriculumOutcome } from '../../src/schemas/outcome';
import {
  getContentStore,
  getJSON,
  scheduleAnchorKey,
  setJSON,
  subjectKey
} from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import type { Lesson } from './_shared/validate.mts';
import { toCurriculumLessonSummary } from '../../src/curriculum/lesson-summary';
import { migrateSubjectRecord } from '../../src/curriculum/migrate-subject';
import { ensureEnglishAdvancedCatalog } from '../../src/curriculum/ensure-outcome-catalog';
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
const PUBLISHED_LESSON_PREFIX = 'published/lessons/';
const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

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
  const [years, subjects, units, lessons, publishedList, classes, scheduled_lessons, scope_sequences, mediaRaw, outcomesRaw, anchor] =
    await Promise.all([
      listEntries<Record<string, unknown>>(store, 'years/'),
      listEntries<Record<string, unknown>>(store, 'subjects/'),
      listEntries<Record<string, unknown>>(store, 'units/'),
      listEntries<Lesson>(store, DRAFT_LESSON_PREFIX),
      store.list({ prefix: PUBLISHED_LESSON_PREFIX }),
      listEntries<Record<string, unknown>>(store, 'classes/'),
      listEntries<Record<string, unknown>>(store, 'scheduled_lessons/'),
      listEntries<Record<string, unknown>>(store, 'scope_sequences/'),
      listEntries<Record<string, unknown>>(store, 'media/'),
      listEntries<Record<string, unknown>>(store, 'outcomes/'),
      getJSON<{ date: string }>(store, scheduleAnchorKey())
    ]);

  const media = mediaRaw
    .map((raw) => {
      const parsed = MediaSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    })
    .filter((entry): entry is Media => entry !== null && entry.status === 'active');

  const publishedIds = new Set(publishedList.blobs.map((blob) => blob.key.slice(PUBLISHED_LESSON_PREFIX.length)));

  const lessonSummaries = lessons.map((lesson) =>
    toCurriculumLessonSummary(lesson, publishedIds.has(lesson.id))
  );

  const migratedSubjects = subjects.map(migrateSubjectRecord);
  const subjectsOut = migratedSubjects.every((result) => result.ok)
    ? await Promise.all(
        migratedSubjects.map(async (result) => {
          if (!result.ok) return subjects[0]!;
          if (result.changed) {
            await setJSON(store, subjectKey(result.subject.id), result.subject);
          }
          return result.subject;
        })
      )
    : subjects;

  const parsedOutcomes = outcomesRaw
    .map((raw) => {
      const parsed = CurriculumOutcomeSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    })
    .filter((entry): entry is CurriculumOutcome => entry !== null);

  const extraOutcomes: CurriculumOutcome[] = [];
  const subjectsWithCatalog = [];
  for (const subject of subjectsOut) {
    const parsedSubject = SubjectSchema.safeParse(subject);
    if (!parsedSubject.success) {
      subjectsWithCatalog.push(subject);
      continue;
    }
    const ensured = await ensureEnglishAdvancedCatalog(
      {
        getJSON: (key) => getJSON(store, key),
        setJSON: (key, value) => setJSON(store, key, value)
      },
      parsedSubject.data
    );
    subjectsWithCatalog.push(ensured.subject);
    extraOutcomes.push(...ensured.outcomes);
  }

  const outcomeById = new Map<string, CurriculumOutcome>();
  for (const row of parsedOutcomes) outcomeById.set(row.id, row);
  for (const row of extraOutcomes) outcomeById.set(row.id, row);

  return {
    years,
    subjects: subjectsWithCatalog,
    units,
    lessons: lessonSummaries,
    classes,
    scheduled_lessons,
    scope_sequences,
    media,
    outcomes: [...outcomeById.values()],
    schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
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

  const curriculum = await buildCurriculum(getContentStore());
  return withCors(okResponse(200, curriculum), request, env);
}

export const config = { path: '/api/curriculum' };
