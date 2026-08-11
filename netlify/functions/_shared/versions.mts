import type { Store } from '@netlify/blobs';
import {
  ClassHomepageSchema,
  ClassSchema,
  LessonSchema,
  UnitSchema,
  VersionIndexSchema,
  VersionRecordSchema,
  type Class,
  type Lesson,
  type Unit,
  type VersionIndex,
  type VersionKind,
  type VersionReason,
  type VersionRecord
} from '../../../src/schemas';
import {
  appendCheckpointToIndex,
  emptyVersionIndex,
  nextRevision,
  pruneIndexEntries,
  revisionsToDelete,
  VERSION_RETENTION,
  versionTypeForKind
} from '../../../src/recovery/versions';
import {
  classKey,
  draftLessonKey,
  unitKey,
  versionIndexKey,
  versionKey,
  versionsPrefix
} from '../../../src/storage/keys';
import { deleteBlob, getJSON, setJSON } from './blobs.mts';

export type JsonStore = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys?(prefix: string): Promise<string[]>;
};

export class VersionStoreError extends Error {
  readonly code: 'not_found' | 'validation_error';
  readonly details?: unknown;

  constructor(code: 'not_found' | 'validation_error', message: string, details?: unknown) {
    super(message);
    this.name = 'VersionStoreError';
    this.code = code;
    this.details = details;
  }
}

export function createMemoryJsonStore(initial: Record<string, unknown> = {}): JsonStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    async getJSON<T>(key: string): Promise<T | null> {
      if (!map.has(key)) return null;
      return map.get(key) as T;
    },
    async setJSON(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
    async listKeys(prefix: string): Promise<string[]> {
      return [...map.keys()].filter((key) => key.startsWith(prefix));
    }
  };
}

export function createNetlifyJsonStore(store: Store): JsonStore {
  return {
    getJSON: <T,>(key: string) => getJSON<T>(store, key),
    setJSON: (key, value) => setJSON(store, key, value),
    delete: (key) => deleteBlob(store, key),
    async listKeys(prefix: string): Promise<string[]> {
      const { blobs } = await store.list({ prefix });
      return blobs.map((blob) => blob.key);
    }
  };
}

function versionRecordId(kind: VersionKind, parentId: string, revision: number): string {
  return `version_${kind}_${parentId}_${revision}`;
}

function liveKeyForKind(kind: VersionKind, parentId: string): string {
  if (kind === 'lesson') return draftLessonKey(parentId);
  if (kind === 'unit') return unitKey(parentId);
  return classKey(parentId);
}

async function loadIndex(store: JsonStore, kind: VersionKind, parentId: string): Promise<VersionIndex> {
  const raw = await store.getJSON(versionIndexKey(kind, parentId));
  if (!raw) return emptyVersionIndex(kind, parentId);
  const parsed = VersionIndexSchema.safeParse(raw);
  if (!parsed.success) return emptyVersionIndex(kind, parentId);
  return parsed.data;
}

export async function writeCheckpoint(
  store: JsonStore,
  opts: {
    kind: VersionKind;
    parentId: string;
    snapshot: unknown;
    reason: VersionReason;
    label?: string;
    now?: string;
  }
): Promise<VersionRecord> {
  const { kind, parentId, snapshot, reason, label, now } = opts;
  const index = await loadIndex(store, kind, parentId);
  const revision = nextRevision(index);
  const created_at = now ?? new Date().toISOString();
  const id = versionRecordId(kind, parentId, revision);

  const record = VersionRecordSchema.parse({
    id,
    type: versionTypeForKind(kind),
    kind,
    parent_id: parentId,
    revision,
    created_at,
    reason,
    label: label ?? null,
    snapshot
  });

  await store.setJSON(versionKey(kind, parentId, revision), record);

  const withEntry = appendCheckpointToIndex(index, {
    id: record.id,
    revision: record.revision,
    created_at: record.created_at,
    reason: record.reason,
    ...(typeof record.label === 'string' && record.label.length > 0 ? { label: record.label } : {})
  });

  const toDelete = revisionsToDelete(withEntry, VERSION_RETENTION);
  for (const rev of toDelete) {
    await store.delete(versionKey(kind, parentId, rev));
  }

  const pruned = pruneIndexEntries(withEntry, VERSION_RETENTION);
  await store.setJSON(versionIndexKey(kind, parentId), pruned);
  return record;
}

export async function listVersionIndex(
  store: JsonStore,
  kind: VersionKind,
  parentId: string
): Promise<VersionIndex> {
  return loadIndex(store, kind, parentId);
}

export async function getVersion(
  store: JsonStore,
  kind: VersionKind,
  parentId: string,
  revision: number
): Promise<VersionRecord | null> {
  const raw = await store.getJSON(versionKey(kind, parentId, revision));
  if (!raw) return null;
  const parsed = VersionRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function snapshotForLive(kind: VersionKind, live: unknown): unknown {
  if (kind === 'class_homepage') {
    const homepage =
      live && typeof live === 'object' && 'homepage' in live
        ? (live as { homepage?: unknown }).homepage
        : undefined;
    return { homepage };
  }
  return live;
}

function applyHistoricalSnapshot(
  kind: VersionKind,
  live: unknown,
  snapshot: unknown,
  updatedAt: string
): unknown {
  if (kind === 'lesson') {
    const parsed = LessonSchema.safeParse(snapshot);
    if (!parsed.success) {
      throw new VersionStoreError('validation_error', 'Version snapshot is not a valid lesson', parsed.error.issues);
    }
    return { ...parsed.data, updated_at: updatedAt };
  }

  if (kind === 'unit') {
    const parsed = UnitSchema.safeParse(snapshot);
    if (!parsed.success) {
      throw new VersionStoreError('validation_error', 'Version snapshot is not a valid unit', parsed.error.issues);
    }
    return { ...parsed.data, updated_at: updatedAt };
  }

  const classParsed = ClassSchema.safeParse(live);
  if (!classParsed.success) {
    throw new VersionStoreError('validation_error', 'Live class data is invalid', classParsed.error.issues);
  }

  const homepageRaw =
    snapshot && typeof snapshot === 'object' && snapshot !== null && 'homepage' in snapshot
      ? (snapshot as { homepage: unknown }).homepage
      : undefined;
  const homepageParsed = ClassHomepageSchema.safeParse(homepageRaw);
  if (!homepageParsed.success) {
    throw new VersionStoreError(
      'validation_error',
      'Version snapshot is not a valid class homepage',
      homepageParsed.error.issues
    );
  }

  return {
    ...classParsed.data,
    homepage: homepageParsed.data,
    updated_at: updatedAt
  };
}

export async function restoreVersion(
  store: JsonStore,
  opts: {
    kind: VersionKind;
    parentId: string;
    revision: number;
    now?: string;
  }
): Promise<Lesson | Unit | Class> {
  const { kind, parentId, revision, now } = opts;
  const version = await getVersion(store, kind, parentId, revision);
  if (!version) {
    throw new VersionStoreError('not_found', 'Version not found');
  }

  const liveKey = liveKeyForKind(kind, parentId);
  const live = await store.getJSON(liveKey);
  if (!live) {
    throw new VersionStoreError('not_found', 'Parent not found');
  }

  const timestamp = now ?? new Date().toISOString();
  await writeCheckpoint(store, {
    kind,
    parentId,
    snapshot: snapshotForLive(kind, live),
    reason: 'restore',
    now: timestamp
  });

  const updated = applyHistoricalSnapshot(kind, live, version.snapshot, timestamp);
  await store.setJSON(liveKey, updated);
  return updated as Lesson | Unit | Class;
}

export async function purgeVersions(
  store: JsonStore,
  kind: VersionKind,
  parentId: string
): Promise<void> {
  const prefix = versionsPrefix(kind, parentId);
  if (store.listKeys) {
    const keys = await store.listKeys(prefix);
    for (const key of keys) {
      await store.delete(key);
    }
    return;
  }

  const index = await loadIndex(store, kind, parentId);
  for (const entry of index.entries) {
    await store.delete(versionKey(kind, parentId, entry.revision));
  }
  await store.delete(versionIndexKey(kind, parentId));
}
