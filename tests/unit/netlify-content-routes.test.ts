// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeStore } = vi.hoisted(() => {
  class FakeStore {
    private readonly data = new Map<string, unknown>();

    reset(): void {
      this.data.clear();
    }

    seed(key: string, value: unknown): void {
      this.data.set(key, value);
    }

    raw(key: string): unknown {
      return this.data.get(key);
    }

    async get(key: string, opts?: { type?: string }): Promise<unknown> {
      if (!this.data.has(key)) return null;
      const value = this.data.get(key);
      if (opts?.type === 'json') return value;
      return typeof value === 'string' ? value : JSON.stringify(value);
    }

    async setJSON(key: string, value: unknown): Promise<void> {
      this.data.set(key, value);
    }

    async delete(key: string): Promise<void> {
      this.data.delete(key);
    }

    async list({ prefix = '' }: { prefix?: string } = {}): Promise<{
      blobs: { key: string; etag: string }[];
      directories: string[];
    }> {
      const blobs = [...this.data.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, etag: 'fake-etag' }));
      return { blobs, directories: [] };
    }
  }

  return { fakeStore: new FakeStore() };
});

vi.mock('../../netlify/functions/_shared/blobs.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../netlify/functions/_shared/blobs.mts')>();
  return { ...actual, getContentStore: () => fakeStore };
});

const {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey
} = await import('../../netlify/functions/_shared/blobs.mts');
const { createSessionToken } = await import('../../netlify/functions/_shared/auth-security.mts');
const curriculumHandler = (await import('../../netlify/functions/curriculum.mts')).default;
const lessonHandler = (await import('../../netlify/functions/lesson.mts')).default;
const publishHandler = (await import('../../netlify/functions/publish.mts')).default;
const publishedLessonHandler = (await import('../../netlify/functions/published-lesson.mts')).default;
const publishedUnitHandler = (await import('../../netlify/functions/published-unit.mts')).default;
const scheduleUnitHandler = (await import('../../netlify/functions/schedule-unit.mts')).default;
const scheduledLessonHandler = (await import('../../netlify/functions/scheduled-lesson.mts')).default;

const SESSION_SECRET = 's'.repeat(32);
const FUNCTION_ORIGIN = 'https://api.example.netlify.app';

beforeEach(() => {
  fakeStore.reset();
  process.env.TEACHING_HUB_PASSPHRASE_HASH = 'scrypt$v1$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  process.env.SESSION_SECRET = SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

afterEach(() => {
  delete process.env.TEACHING_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

function sessionCookieHeader(): string {
  const issued = createSessionToken({ now: Date.now() }, SESSION_SECRET);
  return `teaching_hub_session=${issued.token}`;
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new Request(`${FUNCTION_ORIGIN}${path}`, { ...init, headers });
}

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

function block(overrides: Record<string, unknown>) {
  return {
    id: 'block_001',
    type: 'block' as const,
    variant: 'medium',
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    ...timestamps,
    schema_version: 1 as const,
    ...overrides
  };
}

function draftLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      block({
        id: 'block_l008_001',
        block_type: 'heading',
        variant: 'page',
        content: { text: 'Memory, Identity and Ono' }
      }),
      block({
        id: 'block_l008_002',
        block_type: 'rich_text',
        content: { html: '<p>Safe text</p><script>alert(1)</script>' }
      }),
      block({
        id: 'block_l008_003',
        block_type: 'callout',
        visibility: 'teacher_only',
        content: { style: 'teacher', body: 'Teacher note — do not show students.' }
      })
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const,
    ...overrides
  };
}

describe('GET /api/curriculum', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await curriculumHandler(request('/api/curriculum'));
    expect(response.status).toBe(401);
  });

  it('returns empty lists without auto-seeding when the store is empty', async () => {
    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: {
        years: [],
        subjects: [],
        units: [],
        lessons: [],
        classes: [],
        scheduled_lessons: [],
        schedule_anchor_date: '2026-08-12'
      }
    });
  });

  it('aggregates seeded content and flags published lessons', async () => {
    fakeStore.seed(yearKey('year_12'), { id: 'year_12', title: 'Year 12' });
    fakeStore.seed(subjectKey('subject_engadv'), { id: 'subject_engadv', title: 'English Advanced' });
    fakeStore.seed(unitKey('unit_aotfw'), { id: 'unit_aotfw', title: 'Artist of the Floating World' });
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), { lesson_id: 'lesson_aotfw_008' });
    fakeStore.seed(classKey('class_2026_12engadv1'), {
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_engadv',
      active_unit_ids: ['unit_aotfw'],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduledLessonKey('scheduled_aotfw_008'), {
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_008',
      date: '2026-08-12',
      schedule_order: 1,
      delivery_status: 'current',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduleAnchorKey(), { date: '2026-08-12' });

    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    const body = await response.json();

    expect(body.data.years).toHaveLength(1);
    expect(body.data.subjects).toHaveLength(1);
    expect(body.data.units).toHaveLength(1);
    expect(body.data.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'class_2026_12engadv1', code: '12ENGADV1' })
      ])
    );
    expect(body.data.scheduled_lessons.length).toBeGreaterThan(0);
    expect(body.data.schedule).toBeUndefined();
    expect(body.data.schedule_anchor_date).toBe('2026-08-12');
    expect(body.data.lessons).toEqual([
      {
        id: 'lesson_aotfw_008',
        title: 'Memory, Identity and Ono',
        slug: 'memory_identity_and_ono',
        unit_id: 'unit_aotfw',
        sequence: 8,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ]);
    const lesson = body.data.lessons.find((l: { id: string }) => l.id === 'lesson_aotfw_008');
    expect(lesson.updated_at).toBeTruthy();
  });

  it('includes published_at on lesson summaries when the draft has published_at', async () => {
    fakeStore.seed(
      draftLessonKey('lesson_aotfw_008'),
      draftLesson({ published_at: '2026-02-01T12:00:00.000Z' })
    );

    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    const body = await response.json();

    expect(body.data.lessons).toEqual([
      expect.objectContaining({
        id: 'lesson_aotfw_008',
        published_at: '2026-02-01T12:00:00.000Z'
      })
    ]);
  });
});

describe('GET/PUT /api/lessons/:id', () => {
  it('rejects unauthenticated GET', async () => {
    const response = await lessonHandler(request('/api/lessons/lesson_aotfw_008'), {
      params: { id: 'lesson_aotfw_008' }
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a missing draft', async () => {
    const response = await lessonHandler(
      request('/api/lessons/nope', { cookie: sessionCookieHeader() }),
      { params: { id: 'nope' } }
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 when the route id param is missing', async () => {
    const response = await lessonHandler(request('/api/lessons/'), { params: {} });
    expect(response.status).toBe(404);
  });

  it('returns the stored draft on GET', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', { cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe('Memory, Identity and Ono');
  });

  it('rejects PUT with a body that fails validation', async () => {
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', {
        method: 'PUT',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: '', blocks: [] })
      }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('saves a valid PUT, forcing the id from the route and refreshing updated_at', async () => {
    const draft = draftLesson({ title: 'Updated title', id: 'mismatched-id', updated_at: '2020-01-01T00:00:00.000Z' });
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', {
        method: 'PUT',
        cookie: sessionCookieHeader(),
        body: JSON.stringify(draft)
      }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('lesson_aotfw_008');
    expect(body.data.title).toBe('Updated title');
    expect(body.data.updated_at).not.toBe('2020-01-01T00:00:00.000Z');

    const stored = fakeStore.raw(draftLessonKey('lesson_aotfw_008'));
    expect(stored).toMatchObject({ id: 'lesson_aotfw_008', title: 'Updated title' });
  });

  it('rejects unsupported methods', async () => {
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', { method: 'DELETE', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(405);
  });
});

describe('POST /api/lessons/:id/publish', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST' }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when the draft does not exist', async () => {
    const response = await publishHandler(
      request('/api/lessons/nope/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'nope' } }
    );
    expect(response.status).toBe(404);
  });

  it('rejects an unpublishable draft (empty title)', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson({ title: '' }));
    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('publishes a student snapshot: strips teacher_only blocks and sanitizes rich text', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());

    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.student_path).toBe('/s/lessons/lesson_aotfw_008');

    const snapshot = fakeStore.raw(publishedLessonKey('lesson_aotfw_008')) as {
      blocks: Array<{ block_type: string; content: { html?: string } }>;
    };
    expect(snapshot.blocks).toHaveLength(2);
    expect(snapshot.blocks.some((b) => b.block_type === 'callout')).toBe(false);

    const richText = snapshot.blocks.find((b) => b.block_type === 'rich_text');
    expect(richText?.content.html).not.toContain('<script>');
    expect(richText?.content.html).toContain('Safe text');
  });

  it('sanitises html blocks on publish', async () => {
    fakeStore.seed(
      draftLessonKey('lesson_aotfw_008'),
      draftLesson({
        blocks: [
          block({
            id: 'block_l008_001',
            block_type: 'heading',
            variant: 'page',
            content: { text: 'Memory, Identity and Ono' }
          }),
          block({
            id: 'block_l008_html',
            block_type: 'html',
            content: { html: '<p>Safe html</p><script>alert(1)</script>' }
          })
        ]
      })
    );

    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);

    const snapshot = fakeStore.raw(publishedLessonKey('lesson_aotfw_008')) as {
      blocks: Array<{ block_type: string; content: { html?: string } }>;
    };
    const htmlBlock = snapshot.blocks.find((b) => b.block_type === 'html');
    expect(htmlBlock?.content.html).not.toContain('<script>');
    expect(htmlBlock?.content.html).toContain('Safe html');
  });
});

describe('GET /api/published/lessons/:id', () => {
  it('returns 404 when the lesson is not published', async () => {
    const response = await publishedLessonHandler(
      request('/api/published/lessons/lesson_aotfw_008'),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public: returns the published snapshot without a session cookie', async () => {
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), { lesson_id: 'lesson_aotfw_008', title: 'Published' });
    const response = await publishedLessonHandler(
      request('/api/published/lessons/lesson_aotfw_008'),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe('Published');
  });
});

describe('GET /api/published/units/:id', () => {
  it('returns 404 when the unit blob is missing', async () => {
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_missing'),
      { params: { id: 'unit_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public and returns only published lessons for that unit, in lesson_ids order', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001', 'lesson_aotfw_008'],
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), {
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_other'), {
      lesson_id: 'lesson_other',
      title: 'Other unit lesson',
      unit_id: 'unit_other',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(draftLessonKey('lesson_aotfw_001'), {
      id: 'lesson_aotfw_001',
      title: 'Draft only — must not appear',
      unit_id: 'unit_aotfw'
    });

    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.unit_id).toBe('unit_aotfw');
    expect(body.data.title).toBe('AOTFW Unit');
    expect(body.data.lessons).toEqual([
      { lesson_id: 'lesson_aotfw_008', title: 'Memory' }
    ]);
  });

  it('returns empty lessons array when unit exists but nothing is published', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001'],
      ...timestamps,
      schema_version: 1
    });
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lessons).toEqual([]);
  });
});

function seedClassAndUnit(overrides: {
  classSubject?: string;
  unitSubject?: string;
  lessonIds?: string[];
  existingScheduledLessonIds?: string[];
} = {}) {
  const classSubject = overrides.classSubject ?? 'subject_y12_engadv';
  const unitSubject = overrides.unitSubject ?? classSubject;
  const lessonIds = overrides.lessonIds ?? ['lesson_a', 'lesson_b'];

  fakeStore.seed(classKey('class_2026_12engadv1'), {
    id: 'class_2026_12engadv1',
    type: 'class',
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    slug: '12engadv1',
    academic_year: 2026,
    year_id: 'year_12',
    subject_id: classSubject,
    active_unit_ids: [],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(unitKey('unit_schedule'), {
    id: 'unit_schedule',
    type: 'unit',
    title: 'Schedule Unit',
    slug: 'schedule-unit',
    year_id: 'year_12',
    subject_id: unitSubject,
    lesson_ids: lessonIds,
    status: 'active',
    ...timestamps,
    schema_version: 1
  });

  for (const lessonId of overrides.existingScheduledLessonIds ?? []) {
    fakeStore.seed(scheduledLessonKey(`scheduled_existing_${lessonId}`), {
      id: `scheduled_existing_${lessonId}`,
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_schedule',
      lesson_id: lessonId,
      date: '2026-08-10',
      schedule_order: 1,
      delivery_status: 'planned',
      ...timestamps,
      schema_version: 1
    });
  }
}

describe('POST /api/classes/:classId/schedule-unit', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(401);
  });

  it('creates scheduled lessons and persists meeting_days', async () => {
    seedClassAndUnit();

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          unit_id: 'unit_schedule',
          start_date: '2026-09-01',
          meeting_days: [2, 4]
        })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.scheduled_lessons).toHaveLength(2);
    expect(body.data.class.meeting_days).toEqual([2, 4]);
    expect(body.data.class.active_unit_ids).toContain('unit_schedule');

    const storedClass = fakeStore.raw(classKey('class_2026_12engadv1')) as {
      meeting_days: number[];
    };
    expect(storedClass.meeting_days).toEqual([2, 4]);
    expect(
      fakeStore.raw(scheduledLessonKey('scheduled_class_2026_12engadv1_lesson_a'))
    ).toMatchObject({ lesson_id: 'lesson_a', class_id: 'class_2026_12engadv1' });
  });

  it('returns already_scheduled when every lesson is already scheduled', async () => {
    seedClassAndUnit({
      lessonIds: ['lesson_a'],
      existingScheduledLessonIds: ['lesson_a']
    });

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('already_scheduled');
  });

  it('returns 400 when unit subject does not match class', async () => {
    seedClassAndUnit({
      classSubject: 'subject_y12_engadv',
      unitSubject: 'subject_y12_engstd'
    });

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('subject_mismatch');
  });
});

function seedScheduledLessonsForClass() {
  const rows = [
    {
      id: 'scheduled_a',
      lesson_id: 'lesson_a',
      date: '2026-08-10',
      schedule_order: 1
    },
    {
      id: 'scheduled_b',
      lesson_id: 'lesson_b',
      date: '2026-08-11',
      schedule_order: 2
    },
    {
      id: 'scheduled_c',
      lesson_id: 'lesson_c',
      date: '2026-08-12',
      schedule_order: 3
    }
  ];

  for (const row of rows) {
    fakeStore.seed(scheduledLessonKey(row.id), {
      id: row.id,
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_schedule',
      lesson_id: row.lesson_id,
      date: row.date,
      schedule_order: row.schedule_order,
      delivery_status: 'planned',
      ...timestamps,
      schema_version: 1
    });
  }
}

describe('PATCH /api/scheduled-lessons/:id', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        body: JSON.stringify({ date: '2026-09-01' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 for unknown scheduled lesson', async () => {
    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_missing', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ date: '2026-09-01' })
      }),
      { params: { id: 'scheduled_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('patches date and persists', async () => {
    seedScheduledLessonsForClass();

    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ date: '2026-09-15' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.date).toBe('2026-09-15');
    expect(body.data.schedule_order).toBe(2);

    expect(fakeStore.raw(scheduledLessonKey('scheduled_b'))).toMatchObject({
      date: '2026-09-15',
      schedule_order: 2
    });
  });

  it('reorders up and persists swapped schedule_order values', async () => {
    seedScheduledLessonsForClass();

    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ direction: 'up' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.schedule_order).toBe(1);

    expect(fakeStore.raw(scheduledLessonKey('scheduled_b'))).toMatchObject({
      schedule_order: 1
    });
    expect(fakeStore.raw(scheduledLessonKey('scheduled_a'))).toMatchObject({
      schedule_order: 2
    });
  });
});
