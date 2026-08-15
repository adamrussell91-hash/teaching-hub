import { buildArchiveExport } from '../../../src/export/portable.ts';
import {
  putGithubFile,
  readGithubBackupConfig,
  type GithubBackupResult
} from '../../../src/export/github-backup.ts';
import type { Lesson } from '../../../src/schemas/lesson.ts';
import { getJSON, scheduleAnchorKey } from './blobs.mts';
import type { Store } from '@netlify/blobs';

const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

async function listEntries<T>(store: Store, prefix: string): Promise<T[]> {
  const { blobs } = await store.list({ prefix });
  const entries: (T | null)[] = await Promise.all(blobs.map((blob) => getJSON<T>(store, blob.key)));
  return entries.filter((entry): entry is T => entry !== null);
}

export async function pushStoreArchiveToGithub(input: {
  store: Store;
  env: NodeJS.ProcessEnv;
  createdAt?: string;
}): Promise<{ skipped: true } | { skipped: false; result: GithubBackupResult }> {
  const config = readGithubBackupConfig(input.env);
  if (!config) return { skipped: true };

  const createdAt = input.createdAt ?? new Date().toISOString();
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
    listEntries(input.store, 'years/'),
    listEntries(input.store, 'subjects/'),
    listEntries(input.store, 'units/'),
    listEntries<Lesson>(input.store, 'lessons/'),
    listEntries(input.store, 'classes/'),
    listEntries(input.store, 'scheduled_lessons/'),
    listEntries(input.store, 'scope_sequences/'),
    listEntries(input.store, 'media/'),
    listEntries(input.store, 'templates/compositions/'),
    listEntries(input.store, 'templates/lessons/'),
    listEntries(input.store, 'templates/units/'),
    getJSON<{ date: string }>(input.store, scheduleAnchorKey())
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

  const result = await putGithubFile({
    token: config.token,
    repo: config.repo,
    branch: config.branch,
    json: pack
  });
  return { skipped: false, result };
}
