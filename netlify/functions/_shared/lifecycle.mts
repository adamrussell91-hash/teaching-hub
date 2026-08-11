import {
  applyArchive,
  applyRestoreFromTrash,
  applyTrash,
  type EntityStatus,
  type LifecycleFields
} from '../../../src/recovery/lifecycle';
import {
  collectMediaIdsFromBlocks,
  scanClassDependencies,
  scanLessonDependencies,
  scanMediaDependencies,
  scanUnitDependencies,
  type DependencyHit
} from '../../../src/recovery/dependencies';
import type { Block } from '../../../src/schemas/block';
import type { VersionKind } from '../../../src/schemas';
import {
  classKey,
  compositionKey,
  draftLessonKey,
  lessonTemplateKey,
  mediaFileKey,
  mediaKey,
  publishedLessonKey,
  scheduledLessonKey,
  unitKey,
  unitTemplateKey
} from '../../../src/storage/keys';
import { purgeVersions, type JsonStore } from './versions.mts';

export type LifecycleEntityType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'media'
  | 'lesson_template'
  | 'unit_template'
  | 'composition';

export type LifecycleCollection =
  | 'lessons'
  | 'units'
  | 'classes'
  | 'media'
  | 'lesson-templates'
  | 'unit-templates'
  | 'compositions';

export type TrashSummary = {
  type: LifecycleEntityType;
  id: string;
  title: string;
  trashed_at?: string;
  previous_status?: 'active' | 'archived';
};

export type LifecycleWorld = {
  classes: Array<{
    id: string;
    title: string;
    active_unit_ids?: string[];
    current_unit_id?: string;
  }>;
  units: Array<{ id: string; title: string; lesson_ids: string[] }>;
  scheduled_lessons: Array<{ id: string; lesson_id: string; class_id: string }>;
  documents: Array<{ type: string; id: string; title?: string; mediaIds: string[] }>;
};

export class LifecycleError extends Error {
  readonly code: 'not_found' | 'not_trashed' | 'has_dependencies' | 'invalid_transition';
  readonly dependencies?: DependencyHit[];

  constructor(
    code: 'not_found' | 'not_trashed' | 'has_dependencies' | 'invalid_transition',
    message: string,
    dependencies?: DependencyHit[]
  ) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.dependencies = dependencies;
  }
}

const COLLECTION_TO_TYPE: Record<LifecycleCollection, LifecycleEntityType> = {
  lessons: 'lesson',
  units: 'unit',
  classes: 'class',
  media: 'media',
  'lesson-templates': 'lesson_template',
  'unit-templates': 'unit_template',
  compositions: 'composition'
};

const TYPE_TO_PREFIX: Record<LifecycleEntityType, string> = {
  lesson: 'lessons/',
  unit: 'units/',
  class: 'classes/',
  media: 'media/',
  lesson_template: 'templates/lessons/',
  unit_template: 'templates/units/',
  composition: 'templates/compositions/'
};

const TRASH_SCAN_TYPES: LifecycleEntityType[] = [
  'lesson',
  'unit',
  'class',
  'media',
  'lesson_template',
  'unit_template',
  'composition'
];

export function collectionToType(collection: string): LifecycleEntityType | null {
  if (collection in COLLECTION_TO_TYPE) {
    return COLLECTION_TO_TYPE[collection as LifecycleCollection];
  }
  return null;
}

export function entityKey(type: LifecycleEntityType, id: string): string {
  switch (type) {
    case 'lesson':
      return draftLessonKey(id);
    case 'unit':
      return unitKey(id);
    case 'class':
      return classKey(id);
    case 'media':
      return mediaKey(id);
    case 'lesson_template':
      return lessonTemplateKey(id);
    case 'unit_template':
      return unitTemplateKey(id);
    case 'composition':
      return compositionKey(id);
  }
}

export function versionKindForEntity(type: LifecycleEntityType): VersionKind | null {
  if (type === 'lesson') return 'lesson';
  if (type === 'unit') return 'unit';
  if (type === 'class') return 'class_homepage';
  return null;
}

export function entityNotFoundMessage(type: LifecycleEntityType): string {
  switch (type) {
    case 'lesson':
      return 'Lesson not found';
    case 'unit':
      return 'Unit not found';
    case 'class':
      return 'Class not found';
    case 'media':
      return 'Media not found';
    case 'lesson_template':
      return 'Lesson template not found';
    case 'unit_template':
      return 'Unit template not found';
    case 'composition':
      return 'Composition not found';
  }
}

/**
 * Apply archive / trash / unarchive. Restore-from-trash must use applyRestoreFromTrash
 * (PATCH active while trashed is rejected).
 */
export function applyStatusTransition<T extends LifecycleFields>(
  obj: T,
  nextStatus: EntityStatus,
  now: string,
  reason?: string
): T {
  if (nextStatus === 'trashed') {
    return applyTrash(obj, now, reason) as T;
  }
  if (nextStatus === 'archived') {
    return applyArchive(obj) as T;
  }
  // active — unarchive only (not trash restore)
  if (obj.status === 'trashed') {
    throw new LifecycleError(
      'invalid_transition',
      'Use restore-from-trash to recover a trashed item'
    );
  }
  const {
    trashed_at: _t,
    previous_status: _p,
    trash_reason: _r,
    ...rest
  } = obj as T & LifecycleFields;
  return { ...rest, status: 'active' } as T;
}

async function listDirectJson(
  store: JsonStore,
  prefix: string
): Promise<Array<{ key: string; value: Record<string, unknown> }>> {
  if (!store.listKeys) return [];
  const keys = await store.listKeys(prefix);
  const out: Array<{ key: string; value: Record<string, unknown> }> = [];
  for (const key of keys) {
    const rest = key.slice(prefix.length);
    if (!rest || rest.includes('/')) continue;
    const value = await store.getJSON<Record<string, unknown>>(key);
    if (value && typeof value === 'object') out.push({ key, value });
  }
  return out;
}

function asBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : [];
}

function homepageMediaIds(homepage: unknown): string[] {
  if (!homepage || typeof homepage !== 'object') return [];
  const h = homepage as {
    announcements?: unknown;
    resources?: unknown;
    custom?: unknown;
  };
  return [
    ...collectMediaIdsFromBlocks(asBlocks(h.announcements)),
    ...collectMediaIdsFromBlocks(asBlocks(h.resources)),
    ...collectMediaIdsFromBlocks(asBlocks(h.custom))
  ];
}

export async function loadWorld(store: JsonStore): Promise<LifecycleWorld> {
  const classesRaw = await listDirectJson(store, 'classes/');
  const unitsRaw = await listDirectJson(store, 'units/');
  const scheduledRaw = await listDirectJson(store, 'scheduled_lessons/');
  const lessonsRaw = await listDirectJson(store, 'lessons/');
  const publishedRaw = await listDirectJson(store, 'published/lessons/');
  const compositionsRaw = await listDirectJson(store, 'templates/compositions/');

  const classes = classesRaw.map(({ value }) => ({
    id: String(value.id ?? ''),
    title: String(value.title ?? ''),
    active_unit_ids: Array.isArray(value.active_unit_ids)
      ? (value.active_unit_ids as string[])
      : undefined,
    current_unit_id:
      typeof value.current_unit_id === 'string' ? value.current_unit_id : undefined
  }));

  const units = unitsRaw.map(({ value }) => ({
    id: String(value.id ?? ''),
    title: String(value.title ?? ''),
    lesson_ids: Array.isArray(value.lesson_ids) ? (value.lesson_ids as string[]) : []
  }));

  const scheduled_lessons = scheduledRaw.map(({ value }) => ({
    id: String(value.id ?? ''),
    lesson_id: String(value.lesson_id ?? ''),
    class_id: String(value.class_id ?? '')
  }));

  const documents: LifecycleWorld['documents'] = [];

  for (const { value } of lessonsRaw) {
    documents.push({
      type: 'lesson',
      id: String(value.id ?? ''),
      title: typeof value.title === 'string' ? value.title : undefined,
      mediaIds: collectMediaIdsFromBlocks(asBlocks(value.blocks))
    });
  }
  for (const { value } of publishedRaw) {
    documents.push({
      type: 'published_lesson',
      id: String(value.id ?? ''),
      title: typeof value.title === 'string' ? value.title : undefined,
      mediaIds: collectMediaIdsFromBlocks(asBlocks(value.blocks))
    });
  }
  for (const { value } of unitsRaw) {
    documents.push({
      type: 'unit',
      id: String(value.id ?? ''),
      title: typeof value.title === 'string' ? value.title : undefined,
      mediaIds: collectMediaIdsFromBlocks(asBlocks(value.blocks))
    });
  }
  for (const { value } of classesRaw) {
    documents.push({
      type: 'class',
      id: String(value.id ?? ''),
      title: typeof value.title === 'string' ? value.title : undefined,
      mediaIds: homepageMediaIds(value.homepage)
    });
  }
  for (const { value } of compositionsRaw) {
    const root = value.root;
    const mediaIds =
      root && typeof root === 'object'
        ? collectMediaIdsFromBlocks([root as Block])
        : [];
    documents.push({
      type: 'composition',
      id: String(value.id ?? ''),
      title: typeof value.title === 'string' ? value.title : undefined,
      mediaIds
    });
  }

  return { classes, units, scheduled_lessons, documents };
}

export async function listTrash(store: JsonStore): Promise<TrashSummary[]> {
  const summaries: TrashSummary[] = [];
  for (const type of TRASH_SCAN_TYPES) {
    const rows = await listDirectJson(store, TYPE_TO_PREFIX[type]);
    for (const { value } of rows) {
      if (value.status !== 'trashed') continue;
      const id = typeof value.id === 'string' ? value.id : '';
      const title = typeof value.title === 'string' ? value.title : id;
      if (!id) continue;
      const summary: TrashSummary = { type, id, title };
      if (typeof value.trashed_at === 'string') summary.trashed_at = value.trashed_at;
      if (value.previous_status === 'active' || value.previous_status === 'archived') {
        summary.previous_status = value.previous_status;
      }
      summaries.push(summary);
    }
  }
  summaries.sort((a, b) => {
    const at = a.trashed_at ?? '';
    const bt = b.trashed_at ?? '';
    return bt.localeCompare(at);
  });
  return summaries;
}

export async function scanDependencies(
  store: JsonStore,
  type: LifecycleEntityType,
  id: string
): Promise<DependencyHit[]> {
  const world = await loadWorld(store);
  if (type === 'lesson') return scanLessonDependencies(id, world);
  if (type === 'unit') return scanUnitDependencies(id, world);
  if (type === 'class') return scanClassDependencies(id, world);
  if (type === 'media') return scanMediaDependencies(id, world);
  // templates / compositions: no hard inbound refs in v1
  return [];
}

export async function restoreEntityFromTrash(
  store: JsonStore,
  type: LifecycleEntityType,
  id: string,
  now?: string
): Promise<Record<string, unknown>> {
  const key = entityKey(type, id);
  const raw = await store.getJSON<LifecycleFields & Record<string, unknown>>(key);
  if (!raw) throw new LifecycleError('not_found', entityNotFoundMessage(type));
  if (raw.status !== 'trashed') {
    throw new LifecycleError('invalid_transition', 'Item is not trashed');
  }
  const restored = applyRestoreFromTrash(raw);
  const updated = {
    ...restored,
    updated_at: now ?? new Date().toISOString()
  };
  await store.setJSON(key, updated);
  return updated;
}

export async function permanentDelete(
  store: JsonStore,
  type: LifecycleEntityType,
  id: string
): Promise<void> {
  const key = entityKey(type, id);
  const raw = await store.getJSON<LifecycleFields & Record<string, unknown>>(key);
  if (!raw) throw new LifecycleError('not_found', entityNotFoundMessage(type));
  if (raw.status !== 'trashed') {
    throw new LifecycleError('not_trashed', 'Permanent delete requires status trashed');
  }

  const dependencies = await scanDependencies(store, type, id);
  if (dependencies.length > 0) {
    throw new LifecycleError(
      'has_dependencies',
      'Cannot permanently delete while dependencies remain',
      dependencies
    );
  }

  await store.delete(key);

  if (type === 'lesson') {
    await store.delete(publishedLessonKey(id));
  }
  if (type === 'media') {
    await store.delete(mediaFileKey(id));
  }

  const kind = versionKindForEntity(type);
  if (kind) {
    await purgeVersions(store, kind, id);
  }
}

/** Convenience: load entity, apply status transition, save. */
export async function transitionEntityStatus(
  store: JsonStore,
  type: LifecycleEntityType,
  id: string,
  nextStatus: EntityStatus,
  options?: { now?: string; trash_reason?: string }
): Promise<Record<string, unknown>> {
  const key = entityKey(type, id);
  const raw = await store.getJSON<LifecycleFields & Record<string, unknown>>(key);
  if (!raw) throw new LifecycleError('not_found', entityNotFoundMessage(type));
  const now = options?.now ?? new Date().toISOString();
  const next = applyStatusTransition(raw, nextStatus, now, options?.trash_reason);
  const updated = { ...next, updated_at: now };
  await store.setJSON(key, updated);
  return updated;
}

// Re-export for callers that need the scheduled key when clearing refs in tests/helpers
export { scheduledLessonKey };
