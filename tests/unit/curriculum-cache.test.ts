import { describe, expect, it, vi } from 'vitest';
import { createCurriculumCache } from '@/app/curriculum-cache';
import type { CurriculumResponse } from '@/teacher/nav';

function emptyCurriculum(overrides: Partial<CurriculumResponse> = {}): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12',
    ...overrides
  };
}

describe('createCurriculumCache', () => {
  it('reuses one in-flight fetch until invalidated', async () => {
    const fetchCurriculum = vi
      .fn()
      .mockResolvedValueOnce(emptyCurriculum({ classes: [{ id: 'a' } as never] }))
      .mockResolvedValueOnce(emptyCurriculum({ classes: [{ id: 'a' } as never, { id: 'b' } as never] }));

    const cache = createCurriculumCache(fetchCurriculum);

    const first = await cache.get();
    const second = await cache.get();
    expect(fetchCurriculum).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.classes).toHaveLength(1);

    cache.invalidate();
    const third = await cache.get();
    expect(fetchCurriculum).toHaveBeenCalledTimes(2);
    expect(third.classes).toHaveLength(2);
  });

  it('clears a failed promise so the next get retries', async () => {
    const fetchCurriculum = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(emptyCurriculum());

    const cache = createCurriculumCache(fetchCurriculum);

    await expect(cache.get()).rejects.toThrow('network');
    await expect(cache.get()).resolves.toMatchObject({ schedule_anchor_date: '2026-08-12' });
    expect(fetchCurriculum).toHaveBeenCalledTimes(2);
  });
});
