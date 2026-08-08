import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentClassView } from '@/student/class-view';
import type { PublishedClass } from '@/student/published-class';

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

const CLASS_ID = 'class_2026_12engadv1';

function sampleClass(overrides: Partial<PublishedClass> = {}): PublishedClass {
  return {
    id: CLASS_ID,
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    display_name: '12ENGADV1',
    homepage: {
      announcements: [
        {
          id: 'block_ann_001',
          type: 'block',
          block_type: 'heading',
          variant: 'section',
          visibility: 'student_teacher',
          content: { text: 'Welcome back' },
          layout: {},
          print: {},
          settings: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          schema_version: 1
        }
      ],
      resources: [],
      custom: []
    },
    current_unit: { id: 'unit_aotfw', title: 'Artist of the Floating World' },
    current_lesson: {
      id: 'scheduled_aotfw_008',
      title: 'Memory, Identity and Ono',
      lesson_id: 'lesson_aotfw_008'
    },
    schedule: [
      {
        id: 'scheduled_aotfw_001',
        date: '2026-08-11',
        schedule_order: 1,
        lesson_id: 'lesson_aotfw_001',
        title: 'Intro',
        published: true
      },
      {
        id: 'scheduled_aotfw_008',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_aotfw_008',
        title: 'Memory, Identity and Ono',
        published: false
      }
    ],
    active_units: [{ id: 'unit_aotfw', title: 'Artist of the Floating World' }],
    ...overrides
  };
}

describe('mountStudentClassView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders header, current unit/lesson, schedule Open for published only, and homepage blocks', async () => {
    vi.mocked(apiGet).mockResolvedValue(sampleClass());

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('12ENGADV1');
      expect(root.textContent).toContain('Year 12 English Advanced');
      expect(root.textContent).toContain('Artist of the Floating World');
      expect(root.textContent).toContain('Memory, Identity and Ono');
      expect(root.textContent).toContain('Welcome back');
    });

    expect(apiGet).toHaveBeenCalledWith(`/api/published/classes/${CLASS_ID}`);

    const unitLink = root.querySelector(
      '[data-class-section="current-unit"] a.student-class__link'
    );
    expect(unitLink?.getAttribute('href')).toBe('/s/units/unit_aotfw');

    const currentOpen = root.querySelector(
      '[data-class-section="current-lesson"] a.student-class__open'
    );
    expect(currentOpen).toBeNull();

    const scheduleOpens = [
      ...root.querySelectorAll('[data-class-section="schedule"] a.student-class__open')
    ];
    expect(scheduleOpens).toHaveLength(1);
    expect(scheduleOpens[0].getAttribute('href')).toBe('/s/lessons/lesson_aotfw_001');
    expect(scheduleOpens[0].textContent).toBe('Open');

    expect(root.querySelector('[data-homepage-region="announcements"]')).toBeTruthy();
    expect(root.querySelector('[data-homepage-region="resources"]')).toBeNull();
    expect(root.querySelector('[data-homepage-region="custom"]')).toBeNull();
  });

  it('shows Open on current lesson when that lesson is published', async () => {
    vi.mocked(apiGet).mockResolvedValue(
      sampleClass({
        schedule: [
          {
            id: 'scheduled_aotfw_008',
            date: '2026-08-12',
            schedule_order: 1,
            lesson_id: 'lesson_aotfw_008',
            title: 'Memory, Identity and Ono',
            published: true
          }
        ]
      })
    );

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      const open = root.querySelector(
        '[data-class-section="current-lesson"] a.student-class__open'
      );
      expect(open?.getAttribute('href')).toBe('/s/lessons/lesson_aotfw_008');
    });
  });

  it('shows class not found on 404', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Class not found');
    });
  });

  it('shows error copy on non-404 failures', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'server_error', message: 'boom' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unable to load class');
    });
  });
});
