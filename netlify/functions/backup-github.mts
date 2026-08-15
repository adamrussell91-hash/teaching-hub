import { buildArchiveExport } from '../../src/export/portable';
import { GithubBackupError, putGithubFile } from '../../src/export/github-backup.ts';
import type { Lesson } from '../../src/schemas/lesson.ts';
import {
  getContentStore,
  getJSON,
  scheduleAnchorKey
} from './_shared/blobs.mts';
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

const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

type ContentStore = ReturnType<typeof getContentStore>;

async function listEntries<T>(store: ContentStore, prefix: string): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const entries: (T | null)[] = await Promise.all(blobs.map((blob) => getJSON<T>(store, blob.key)));
  return entries.filter((entry): entry is T => entry !== null);
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const token = env.GITHUB_BACKUP_TOKEN;
  const repo = env.GITHUB_BACKUP_REPO;
  if (!token || !repo) {
    return withCors(
      errorResponse(503, 'backup_unconfigured', 'GitHub backup is not configured'),
      request,
      env
    );
  }

  const store = getContentStore();
  const createdAt = new Date().toISOString();
  const [
    years,
    subjects,
    units,
    lessons,
    classes,
    scheduled_lessons,
    scope_sequences,
    media,
    compositions,
    lesson_templates,
    unit_templates,
    anchor
  ] = await Promise.all([
    listEntries(store, 'years/'),
    listEntries(store, 'subjects/'),
    listEntries(store, 'units/'),
    listEntries<Lesson>(store, 'lessons/'),
    listEntries(store, 'classes/'),
    listEntries(store, 'scheduled_lessons/'),
    listEntries(store, 'scope_sequences/'),
    listEntries(store, 'media/'),
    listEntries(store, 'templates/compositions/'),
    listEntries(store, 'templates/lessons/'),
    listEntries(store, 'templates/units/'),
    getJSON<{ date: string }>(store, scheduleAnchorKey())
  ]);

  const pack = buildArchiveExport(
    {
      years,
      subjects,
      units,
      lessons,
      classes,
      scheduled_lessons,
      scope_sequences,
      media,
      compositions,
      lesson_templates,
      unit_templates,
      schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
    },
    createdAt
  );

  try {
    const result = await putGithubFile({
      token,
      repo,
      branch: env.GITHUB_BACKUP_BRANCH,
      json: pack
    });
    return withCors(okResponse(200, result), request, env);
  } catch (err) {
    if (err instanceof GithubBackupError) {
      return withCors(errorResponse(err.status, 'backup_failed', err.message), request, env);
    }
    return withCors(errorResponse(502, 'backup_failed', 'Unable to commit the GitHub backup'), request, env);
  }
}

export const config = { path: '/api/backup/github' };
