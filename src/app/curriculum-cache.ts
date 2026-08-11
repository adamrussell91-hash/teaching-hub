import type { CurriculumResponse } from '@/teacher/nav';

/**
 * Session-scoped curriculum fetch cache. Cleared after creates/mutations so
 * the next get() hits the network and lists/rail see new entities without a
 * hard reload.
 */
export function createCurriculumCache(
  fetchCurriculum: () => Promise<CurriculumResponse>
): {
  invalidate: () => void;
  get: () => Promise<CurriculumResponse>;
} {
  let curriculumPromise: Promise<CurriculumResponse> | null = null;

  return {
    invalidate(): void {
      curriculumPromise = null;
    },
    get(): Promise<CurriculumResponse> {
      if (!curriculumPromise) {
        curriculumPromise = fetchCurriculum().catch((error: unknown) => {
          curriculumPromise = null;
          throw error;
        });
      }
      return curriculumPromise;
    }
  };
}
