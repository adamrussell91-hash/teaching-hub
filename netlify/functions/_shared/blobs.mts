import { getStore, type Store } from '@netlify/blobs';
import {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  scopeSequenceKey,
  mediaKey,
  mediaFileKey,
  compositionKey,
  lessonTemplateKey,
  unitTemplateKey,
  versionKey,
  versionIndexKey,
  versionsPrefix,
  aiUsageLogKey,
  aiJobKey,
  aiTranscriptKey
} from '../../../src/storage/keys';

// Re-exported so function handlers have one place to import key builders from,
// alongside the Blob store helpers below. Key strings must stay identical to
// `src/storage/keys.ts` (and to `scripts/mock-store.ts`, used by the dev server).
export {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  scopeSequenceKey,
  mediaKey,
  mediaFileKey,
  compositionKey,
  lessonTemplateKey,
  unitTemplateKey,
  versionKey,
  versionIndexKey,
  versionsPrefix,
  aiUsageLogKey,
  aiJobKey,
  aiTranscriptKey
};

const CONTENT_STORE_NAME = 'teaching-hub-content';

export function getContentStore(): Store {
  return getStore(CONTENT_STORE_NAME);
}

export async function getJSON<T = unknown>(store: Store, key: string): Promise<T | null> {
  return (await store.get(key, { type: 'json' })) as T | null;
}

export async function setJSON(store: Store, key: string, value: unknown): Promise<void> {
  await store.setJSON(key, value);
}

export async function deleteBlob(store: Store, key: string): Promise<void> {
  await store.delete(key);
}
