import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentLessonView } from '@/student/lesson-view';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(opts: { code: string; message: string }) {
      super(opts.message);
      this.code = opts.code;
    }
  }
}));

import { apiGet, ApiClientError } from '@/api/client';

describe('mountStudentLessonView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders Back to unit linking to /s/units/{unit_id}', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

    await vi.waitFor(() => {
      const link = root.querySelector(
        'a.student-surface__back'
      ) as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Back to unit');
      expect(link?.getAttribute('href')).toBe('/s/units/unit_aotfw');
    });
  });

  it('shows not-found without a back link when lesson missing', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
    expect(root.querySelector('a.student-surface__back')).toBeNull();
  });
});
