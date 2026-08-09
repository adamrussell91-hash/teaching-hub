import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockStore, type SeedData } from './mock-store';
import {
  draftLessonKey,
  publishedLessonKey,
  yearKey,
  subjectKey,
  unitKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  scopeSequenceKey,
  mediaKey,
  compositionKey
} from '../src/storage/keys';
import {
  ClassHomepageSchema,
  ClassSchema,
  CompositionTemplateSchema,
  LessonSchema,
  PublishableLessonSchema,
  PublishedLessonSchema,
  ScheduledLessonSchema,
  ScopeSequenceSchema,
  SectionBlockSchema,
  SubjectSchema,
  MediaSchema,
  TimelineItemSchema,
  UnitSchema,
  toPublishedLesson,
  type Class,
  type ClassHomepage,
  type CompositionSummary,
  type CompositionTemplate,
  type Lesson,
  type ScheduledLesson,
  type ScopeSequence,
  type Media,
  type TimelineItem,
  type Unit
} from '../src/schemas';
import { orderLessonsByUnitIds } from '../src/schemas/published-unit';
import { filterBlocksForStudent } from '../src/blocks/visibility';
import { sanitizeBlocksDeep } from '../src/blocks/sanitize-blocks';
import { applyScheduleUnit } from '../src/schedule/schedule-unit';
import { reorderScheduledLesson } from '../src/schedule/reorder';
import { buildPublishedClass } from '../src/schedule/build-published-class';

export const SESSION_COOKIE_NAME = 'teaching_hub_session';

const DEFAULT_PASSPHRASE = 'teaching-hub-local';
const DEFAULT_SESSION_SECRET = 'local-dev-secret';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface CreateMockApiOptions {
  seed: SeedData;
  passphrase?: string;
  sessionSecret?: string;
}

export interface MockApiRequestOptions {
  cookie?: string | null;
  body?: unknown;
}

/**
 * A minimal Response-like object. We deliberately avoid the WHATWG
 * `Response`/`Headers` globals here: browsers (and happy-dom, which backs
 * our Vitest environment) hide the `set-cookie` header from JS reads on
 * `Response.headers` for security, which makes it impossible for tests to
 * assert on the session cookie the same way a real client never could.
 * This mock is a server-side test harness, so we expose it directly.
 */
export interface MockResponse {
  status: number;
  headers: {
    get(name: string): string | null;
    forEach(callback: (value: string, name: string) => void): void;
  };
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface MockApi {
  request(
    method: string,
    path: string,
    options?: MockApiRequestOptions
  ): Promise<MockResponse>;
  handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function loadSeedFile(filePath: string): SeedData {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as SeedData;
}

// `sanitizeRichTextHtml` relies on the browser `DOMParser`/`Node` globals.
// Vitest's happy-dom environment already provides them; the plain Node
// process running the Vite dev server does not, so polyfill lazily there.
let domPolyfillPromise: Promise<void> | null = null;
function ensureDomPolyfill(): Promise<void> {
  if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== 'undefined') {
    return Promise.resolve();
  }
  if (!domPolyfillPromise) {
    domPolyfillPromise = import('happy-dom').then(({ Window }) => {
      const window = new Window();
      (globalThis as Record<string, unknown>).DOMParser = window.DOMParser;
      (globalThis as Record<string, unknown>).Node = window.Node;
    });
  }
  return domPolyfillPromise;
}

class MockHeaders {
  private readonly entries = new Map<string, string>();

  set(name: string, value: string): void {
    this.entries.set(name.toLowerCase(), value);
  }

  get(name: string): string | null {
    return this.entries.get(name.toLowerCase()) ?? null;
  }

  forEach(callback: (value: string, name: string) => void): void {
    this.entries.forEach((value, name) => callback(value, name));
  }
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): MockResponse {
  const headers = new MockHeaders();
  headers.set('content-type', 'application/json');
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      headers.set(name, value);
    }
  }
  const text = JSON.stringify(body);
  return {
    status,
    headers,
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    }
  };
}

function okResponse(
  status: number,
  data: unknown,
  extraHeaders?: Record<string, string>
): MockResponse {
  return jsonResponse(status, { ok: true, data }, extraHeaders);
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown
): MockResponse {
  return jsonResponse(status, {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details }
  });
}

function unauthorizedResponse(): MockResponse {
  return errorResponse(401, 'unauthorized', 'Authentication required');
}

function notFoundResponse(message: string): MockResponse {
  return errorResponse(404, 'not_found', message);
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'item'
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultScopeTerms(weekCount = 40) {
  const termWeeks = weekCount / 4;
  return [1, 2, 3, 4].map((term_number) => {
    const start_week = (term_number - 1) * termWeeks + 1;
    const end_week = term_number * termWeeks;
    return {
      id: `term_t${term_number}`,
      title: `Term ${term_number}`,
      term_number,
      start_week,
      end_week
    };
  });
}

interface SessionTokenPayload {
  expiresAt: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function extractSessionToken(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return trimmed.slice(SESSION_COOKIE_NAME.length + 1);
    }
  }
  return undefined;
}

function buildSessionCookie(token: string): string {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

interface CurriculumLessonSummary {
  id: string;
  title: string;
  slug: string;
  unit_id: string;
  sequence: number;
  status: string;
  published: boolean;
  updated_at: string;
  published_at?: string;
}

const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

export function createMockApi(options: CreateMockApiOptions): MockApi {
  const passphrase = options.passphrase ?? DEFAULT_PASSPHRASE;
  const sessionSecret = options.sessionSecret ?? DEFAULT_SESSION_SECRET;

  const store = new MockStore();
  store.loadSeed(options.seed);

  const seedIds = {
    years: options.seed.years.map((y) => (y as { id: string }).id),
    subjects: options.seed.subjects.map((s) => (s as { id: string }).id),
    units: options.seed.units.map((u) => (u as { id: string }).id),
    lessons: options.seed.lessons.map((l) => (l as { id: string }).id),
    classes: options.seed.classes.map((c) => (c as { id: string }).id),
    scheduled_lessons: options.seed.scheduled_lessons.map((s) => (s as { id: string }).id),
    scope_sequences: (options.seed.scope_sequences ?? []).map((s) => (s as { id: string }).id),
    media: (options.seed.media ?? []).map((m) => (m as { id: string }).id)
  };

  function sign(payload: string): string {
    return createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  }

  function createSessionToken(): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const payload = base64UrlEncode(JSON.stringify({ expiresAt } satisfies SessionTokenPayload));
    const signature = sign(payload);
    return { token: `${payload}.${signature}`, expiresAt };
  }

  function verifySessionToken(token: string | undefined): { authenticated: boolean; expiresAt?: number } {
    if (!token) return { authenticated: false };
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return { authenticated: false };

    const expectedSignature = sign(payload);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { authenticated: false };
    }

    let parsed: SessionTokenPayload;
    try {
      parsed = JSON.parse(base64UrlDecode(payload)) as SessionTokenPayload;
    } catch {
      return { authenticated: false };
    }

    if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
      return { authenticated: false };
    }

    return { authenticated: true, expiresAt: parsed.expiresAt };
  }

  function getSession(cookieHeader: string | null | undefined) {
    return verifySessionToken(extractSessionToken(cookieHeader));
  }

  function buildCurriculum() {
    const years = seedIds.years
      .map((id) => store.getJSON(yearKey(id)))
      .filter((y): y is Record<string, unknown> => Boolean(y));
    const subjects = seedIds.subjects
      .map((id) => store.getJSON(subjectKey(id)))
      .filter((s): s is Record<string, unknown> => Boolean(s));
    const units = seedIds.units
      .map((id) => store.getJSON(unitKey(id)))
      .filter((u): u is Record<string, unknown> => Boolean(u));
    const lessons: CurriculumLessonSummary[] = seedIds.lessons
      .map((id) => store.getJSON<Lesson>(draftLessonKey(id)))
      .filter((lesson): lesson is Lesson => Boolean(lesson))
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        unit_id: lesson.unit_id,
        sequence: lesson.sequence,
        status: lesson.status,
        published: store.get(publishedLessonKey(lesson.id)) !== undefined,
        updated_at: lesson.updated_at,
        ...(lesson.published_at ? { published_at: lesson.published_at } : {})
      }));

    const classes = seedIds.classes
      .map((id) => store.getJSON<Class>(classKey(id)))
      .filter((cls): cls is Class => Boolean(cls));
    const scheduled_lessons = seedIds.scheduled_lessons
      .map((id) => store.getJSON<ScheduledLesson>(scheduledLessonKey(id)))
      .filter((entry): entry is ScheduledLesson => Boolean(entry));
    const scope_sequences = seedIds.scope_sequences
      .map((id) => {
        const raw = store.getJSON(scopeSequenceKey(id));
        if (!raw) return null;
        const parsed = ScopeSequenceSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })
      .filter((entry): entry is ScopeSequence => entry !== null);

    const media = seedIds.media
      .map((id) => {
        const raw = store.getJSON(mediaKey(id));
        if (!raw) return null;
        const parsed = MediaSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      })
      .filter((entry): entry is Media => entry !== null && entry.status === 'active');

    const anchor = store.getJSON<{ date: string }>(scheduleAnchorKey());

    return {
      years,
      subjects,
      units,
      lessons,
      classes,
      scheduled_lessons,
      scope_sequences,
      media,
      schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
    };
  }

  function handleAuth(body: unknown): MockResponse {
    const candidate = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const providedPassphrase = candidate.passphrase;

    if (typeof providedPassphrase !== 'string' || providedPassphrase !== passphrase) {
      return errorResponse(401, 'invalid_credentials', 'Invalid passphrase');
    }

    const { token, expiresAt } = createSessionToken();
    return okResponse(
      200,
      { authenticated: true, expiresAt },
      { 'set-cookie': buildSessionCookie(token) }
    );
  }

  function handleSession(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) {
      return okResponse(200, { authenticated: false });
    }
    return okResponse(200, { authenticated: true, expiresAt: session.expiresAt });
  }

  function handleLogout(): MockResponse {
    return okResponse(
      200,
      { loggedOut: true },
      { 'set-cookie': buildClearedSessionCookie() }
    );
  }

  function handleGetCurriculum(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, buildCurriculum());
  }

  function handleGetDraftLesson(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const lesson = store.getJSON<Lesson>(draftLessonKey(id));
    if (!lesson) return notFoundResponse('Lesson not found');
    return okResponse(200, lesson);
  }

  function handlePutDraftLesson(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const existing = store.getJSON<Lesson>(draftLessonKey(id));
    const bodyRecord = body as Record<string, unknown>;
    const candidate = {
      ...bodyRecord,
      id,
      updated_at: new Date().toISOString(),
      // Preserve publish timestamp unless the client explicitly sends one.
      published_at:
        bodyRecord.published_at !== undefined
          ? bodyRecord.published_at
          : existing?.published_at
    };

    const parsed = LessonSchema.safeParse(candidate);
    if (!parsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'Draft failed validation',
        parsed.error.issues
      );
    }

    store.setJSON(draftLessonKey(id), parsed.data);
    return okResponse(200, parsed.data);
  }

  async function handlePublishLesson(
    cookie: string | null | undefined,
    id: string
  ): Promise<MockResponse> {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const draft = store.getJSON<Lesson>(draftLessonKey(id));
    if (!draft) return notFoundResponse('Lesson not found');

    const parsed = PublishableLessonSchema.safeParse(draft);
    if (!parsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'Lesson is not publishable',
        parsed.error.issues
      );
    }

    await ensureDomPolyfill();

    const publishedAt = new Date().toISOString();
    const fullSnapshot = toPublishedLesson(parsed.data, publishedAt);
    const studentBlocks = sanitizeBlocksDeep(filterBlocksForStudent(fullSnapshot.blocks));

    const studentSnapshot = PublishedLessonSchema.parse({
      ...fullSnapshot,
      blocks: studentBlocks
    });

    store.setJSON(publishedLessonKey(id), studentSnapshot);
    // Persist publish timestamp on the draft so reload shows Published / Unpublished changes.
    store.setJSON(draftLessonKey(id), {
      ...parsed.data,
      published_at: publishedAt,
      updated_at: publishedAt
    });
    return okResponse(200, { student_path: `/s/lessons/${id}` });
  }

  function handleGetPublishedLesson(id: string): MockResponse {
    const snapshot = store.getJSON(publishedLessonKey(id));
    if (!snapshot) return notFoundResponse('Lesson is not published');
    return okResponse(200, snapshot);
  }

  function handleGetPublishedClass(classId: string): MockResponse {
    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');

    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success || classParsed.data.status !== 'active') {
      return notFoundResponse('Class not found');
    }

    const cls = classParsed.data;

    const scheduled = store
      .listKeys('scheduled_lessons/')
      .map((key) => store.getJSON<ScheduledLesson>(key))
      .filter((row): row is ScheduledLesson => row != null && row.class_id === classId);

    const unitIds = new Set<string>(cls.active_unit_ids);
    for (const row of scheduled) {
      unitIds.add(row.unit_id);
    }
    if (cls.current_unit_id) {
      unitIds.add(cls.current_unit_id);
    }

    const units = [...unitIds]
      .map((unitId) => UnitSchema.safeParse(store.getJSON(unitKey(unitId))))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data);

    const lessonIds = new Set(scheduled.map((row) => row.lesson_id));
    if (cls.current_unit_id) {
      const currentUnit = units.find((unit) => unit.id === cls.current_unit_id);
      if (currentUnit) {
        for (const lessonId of currentUnit.lesson_ids) {
          lessonIds.add(lessonId);
        }
      }
    }
    const lessons: Array<{ id: string; title: string }> = [];
    for (const lessonId of lessonIds) {
      const draft = store.getJSON<{ title?: string }>(draftLessonKey(lessonId));
      if (draft && typeof draft.title === 'string' && draft.title) {
        lessons.push({ id: lessonId, title: draft.title });
      }
    }

    const publishedLessonIds = new Set(
      store
        .listKeys('published/lessons/')
        .map((key) => key.slice('published/lessons/'.length))
        .filter(Boolean)
    );

    const dto = buildPublishedClass({
      cls,
      units,
      lessons,
      scheduled,
      publishedLessonIds
    });
    return okResponse(200, dto);
  }

  function handleGetPublishedUnit(id: string): MockResponse {
    const unit = store.getJSON<{ title?: string; lesson_ids?: string[] }>(
      unitKey(id)
    );
    if (!unit || typeof unit.title !== 'string' || !unit.title) {
      return notFoundResponse('Unit not found');
    }

    const matching: { lesson_id: string; title: string }[] = [];
    for (const key of store.listKeys('published/lessons/')) {
      const snapshot = store.getJSON<{
        lesson_id?: string;
        title?: string;
        unit_id?: string;
      }>(key);
      if (
        snapshot &&
        snapshot.unit_id === id &&
        typeof snapshot.lesson_id === 'string' &&
        snapshot.lesson_id &&
        typeof snapshot.title === 'string' &&
        snapshot.title
      ) {
        matching.push({
          lesson_id: snapshot.lesson_id,
          title: snapshot.title
        });
      }
    }

    const lessons = orderLessonsByUnitIds(
      Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [],
      matching
    );
    return okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons
    });
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function handleScheduleUnit(
    cookie: string | null | undefined,
    classId: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const unit_id = record.unit_id;
    const start_date = record.start_date;

    if (typeof unit_id !== 'string' || !unit_id) {
      return errorResponse(400, 'validation_error', 'unit_id is required');
    }
    if (typeof start_date !== 'string' || !DATE_RE.test(start_date)) {
      return errorResponse(400, 'validation_error', 'start_date must be YYYY-MM-DD');
    }

    let meeting_days: number[] | undefined;
    if (record.meeting_days !== undefined) {
      if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
        return errorResponse(
          400,
          'validation_error',
          'meeting_days must be a non-empty array when provided'
        );
      }
      meeting_days = [];
      for (const day of record.meeting_days) {
        if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
          return errorResponse(
            400,
            'validation_error',
            'meeting_days must contain integers from 1 to 7'
          );
        }
        meeting_days.push(day);
      }
    }

    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');
    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    const rawUnit = store.getJSON(unitKey(unit_id));
    if (!rawUnit) return notFoundResponse('Unit not found');
    const unitParsed = UnitSchema.safeParse(rawUnit);
    if (!unitParsed.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    if (unitParsed.data.subject_id !== classParsed.data.subject_id) {
      return errorResponse(400, 'subject_mismatch', 'Unit subject does not match class subject');
    }

    if (unitParsed.data.lesson_ids.length === 0) {
      return errorResponse(400, 'no_lessons', 'Unit has no lessons');
    }

    const meetingDays = meeting_days ?? classParsed.data.meeting_days ?? [1, 2, 3, 4, 5];

    const existing = store
      .listKeys('scheduled_lessons/')
      .map((key) => store.getJSON<ScheduledLesson>(key))
      .filter((entry): entry is ScheduledLesson => entry != null && entry.class_id === classId);

    const nowIso = new Date().toISOString();
    const idFactory = (lessonId: string) => `scheduled_${classId}_${lessonId}`;

    const result = applyScheduleUnit({
      cls: classParsed.data,
      unit: unitParsed.data,
      existing,
      startDate: start_date,
      meetingDays,
      nowIso,
      idFactory
    });

    if (!result.ok) {
      return errorResponse(400, result.code, result.message);
    }

    for (const created of result.created) {
      if (store.get(scheduledLessonKey(created.id)) !== undefined) {
        return errorResponse(
          409,
          'conflict',
          `Scheduled lesson id already exists: ${created.id}`
        );
      }
    }

    store.setJSON(classKey(classId), result.class);
    for (const created of result.created) {
      store.setJSON(scheduledLessonKey(created.id), created);
      seedIds.scheduled_lessons.push(created.id);
    }

    return okResponse(200, {
      class: result.class,
      scheduled_lessons: result.created
    });
  }

  function handlePatchScheduledLesson(
    cookie: string | null | undefined,
    id: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasDate = record.date !== undefined;
    const hasDirection = record.direction !== undefined;

    if (!hasDate && !hasDirection) {
      return errorResponse(400, 'validation_error', 'Provide date and/or direction');
    }

    let date: string | undefined;
    if (hasDate) {
      if (typeof record.date !== 'string' || !DATE_RE.test(record.date)) {
        return errorResponse(400, 'validation_error', 'date must be YYYY-MM-DD');
      }
      date = record.date;
    }

    let direction: 'up' | 'down' | undefined;
    if (hasDirection) {
      if (record.direction !== 'up' && record.direction !== 'down') {
        return errorResponse(400, 'validation_error', "direction must be 'up' or 'down'");
      }
      direction = record.direction;
    }

    const existing = store.getJSON<ScheduledLesson>(scheduledLessonKey(id));
    if (!existing) return notFoundResponse('Scheduled lesson not found');

    const nowIso = new Date().toISOString();
    let result: ScheduledLesson = { ...existing };
    const toPersist = new Map<string, ScheduledLesson>();

    if (date !== undefined) {
      result = { ...result, date, updated_at: nowIso };
      toPersist.set(id, result);
    }

    if (direction !== undefined) {
      const classRows = store
        .listKeys('scheduled_lessons/')
        .map((key) => store.getJSON<ScheduledLesson>(key))
        .filter((entry): entry is ScheduledLesson => entry != null && entry.class_id === existing.class_id)
        .sort((a, b) => a.schedule_order - b.schedule_order);

      const withTarget = classRows.map((row) => (row.id === id ? result : row));
      const reordered = reorderScheduledLesson(withTarget, id, direction);

      for (const row of reordered) {
        const before = withTarget.find((r) => r.id === row.id);
        if (!before || before.schedule_order === row.schedule_order) continue;
        const updated = { ...row, updated_at: nowIso };
        toPersist.set(updated.id, updated);
        if (updated.id === id) result = updated;
      }
    }

    const validated = ScheduledLessonSchema.safeParse(result);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid');
    }

    toPersist.set(id, validated.data);

    for (const row of toPersist.values()) {
      const rowValidated = ScheduledLessonSchema.safeParse(row);
      if (!rowValidated.success) {
        return errorResponse(400, 'validation_error', 'Scheduled lesson data is invalid');
      }
      store.setJSON(scheduledLessonKey(rowValidated.data.id), rowValidated.data);
    }

    return okResponse(200, validated.data);
  }

  function handlePatchClass(
    cookie: string | null | undefined,
    classId: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const hasMeetingDays = record.meeting_days !== undefined;
    const hasCurrent = record.current_scheduled_lesson_id !== undefined;
    const hasHomepage = record.homepage !== undefined;

    if (!hasMeetingDays && !hasCurrent && !hasHomepage) {
      return errorResponse(
        400,
        'validation_error',
        'Provide meeting_days, current_scheduled_lesson_id, and/or homepage'
      );
    }

    let meeting_days: number[] | undefined;
    if (hasMeetingDays) {
      if (!Array.isArray(record.meeting_days) || record.meeting_days.length === 0) {
        return errorResponse(
          400,
          'validation_error',
          'meeting_days must be a non-empty array when provided'
        );
      }
      meeting_days = [];
      for (const day of record.meeting_days) {
        if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
          return errorResponse(
            400,
            'validation_error',
            'meeting_days must contain integers from 1 to 7'
          );
        }
        meeting_days.push(day);
      }
    }

    let current_scheduled_lesson_id: string | null | undefined;
    if (hasCurrent) {
      const value = record.current_scheduled_lesson_id;
      if (value === null) {
        current_scheduled_lesson_id = null;
      } else if (typeof value === 'string' && value) {
        current_scheduled_lesson_id = value;
      } else {
        return errorResponse(
          400,
          'validation_error',
          'current_scheduled_lesson_id must be a non-empty string or null'
        );
      }
    }

    let homepage: ClassHomepage | undefined;
    if (hasHomepage) {
      const homepageParsed = ClassHomepageSchema.safeParse(record.homepage);
      if (!homepageParsed.success) {
        return errorResponse(400, 'validation_error', 'homepage is invalid');
      }
      homepage = homepageParsed.data;
    }

    const rawClass = store.getJSON(classKey(classId));
    if (!rawClass) return notFoundResponse('Class not found');
    const classParsed = ClassSchema.safeParse(rawClass);
    if (!classParsed.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    if (current_scheduled_lesson_id) {
      const scheduled = store.getJSON<ScheduledLesson>(
        scheduledLessonKey(current_scheduled_lesson_id)
      );
      if (!scheduled || scheduled.class_id !== classId) {
        return notFoundResponse('Scheduled lesson not found');
      }
    }

    const nowIso = new Date().toISOString();
    const merged: Record<string, unknown> = {
      ...classParsed.data,
      updated_at: nowIso
    };

    if (meeting_days !== undefined) {
      merged.meeting_days = meeting_days;
    }

    if (current_scheduled_lesson_id !== undefined) {
      if (current_scheduled_lesson_id === null) {
        delete merged.current_scheduled_lesson_id;
      } else {
        merged.current_scheduled_lesson_id = current_scheduled_lesson_id;
      }
    }

    if (homepage !== undefined) {
      merged.homepage = homepage;
    }

    const validated = ClassSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid');
    }

    store.setJSON(classKey(classId), validated.data);
    return okResponse(200, validated.data);
  }

  function handlePatchScopeSequence(
    cookie: string | null | undefined,
    scopeId: string,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    if (record.timeline_items === undefined) {
      return errorResponse(400, 'validation_error', 'Provide timeline_items');
    }
    if (!Array.isArray(record.timeline_items)) {
      return errorResponse(400, 'validation_error', 'timeline_items must be an array');
    }

    const rawScope = store.getJSON(scopeSequenceKey(scopeId));
    if (!rawScope) return notFoundResponse('Scope sequence not found');
    const scopeParsed = ScopeSequenceSchema.safeParse(rawScope);
    if (!scopeParsed.success) {
      return errorResponse(400, 'validation_error', 'Scope sequence data is invalid');
    }

    const weekCount = scopeParsed.data.week_count;
    const timeline_items: TimelineItem[] = [];
    const seenUnitIds = new Set<string>();

    for (const raw of record.timeline_items) {
      const itemParsed = TimelineItemSchema.safeParse(raw);
      if (!itemParsed.success) {
        return errorResponse(400, 'validation_error', 'timeline_items contains an invalid item');
      }

      const item = itemParsed.data;
      if (item.start_week < 1 || item.end_week > weekCount) {
        return errorResponse(
          400,
          'validation_error',
          `timeline item weeks must be between 1 and ${weekCount}`
        );
      }

      if (item.kind === 'unit') {
        if (seenUnitIds.has(item.unit_id)) {
          return errorResponse(
            400,
            'validation_error',
            'unit_id must be unique among unit timeline items'
          );
        }
        const rawUnit = store.getJSON(unitKey(item.unit_id));
        const unitParsed = UnitSchema.safeParse(rawUnit);
        if (!unitParsed.success) {
          return errorResponse(
            400,
            'validation_error',
            `Unknown unit_id: ${item.unit_id}`
          );
        }
        if (unitParsed.data.subject_id !== scopeParsed.data.subject_id) {
          return errorResponse(
            400,
            'validation_error',
            'unit_id must belong to the scope subject'
          );
        }
        seenUnitIds.add(item.unit_id);
      }

      timeline_items.push(item);
    }

    const nowIso = new Date().toISOString();
    const merged = {
      ...scopeParsed.data,
      timeline_items,
      updated_at: nowIso
    };

    const validated = ScopeSequenceSchema.safeParse(merged);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Scope sequence data is invalid');
    }

    store.setJSON(scopeSequenceKey(scopeId), validated.data);
    return okResponse(200, validated.data);
  }

  function handlePostClass(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const code = typeof record.code === 'string' ? record.code.trim() : '';
    const year_id = typeof record.year_id === 'string' ? record.year_id : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
    const academic_year =
      typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
        ? record.academic_year
        : NaN;

    if (!title || !code || !year_id || !subject_id || !Number.isFinite(academic_year)) {
      return errorResponse(
        400,
        'validation_error',
        'title, code, academic_year, year_id, and subject_id are required'
      );
    }

    if (!store.getJSON(yearKey(year_id))) {
      return notFoundResponse('Year not found');
    }
    if (!store.getJSON(subjectKey(subject_id))) {
      return notFoundResponse('Subject not found');
    }

    const timestamp = nowIso();
    const id = newId('class');
    const candidate: Class = {
      id,
      type: 'class',
      title,
      slug: slugify(title),
      code,
      academic_year,
      year_id,
      subject_id,
      active_unit_ids: [],
      homepage: { announcements: [], resources: [], custom: [] },
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = ClassSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Class data is invalid', validated.error.flatten());
    }

    store.setJSON(classKey(id), validated.data);
    seedIds.classes.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostUnit(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const year_id = typeof record.year_id === 'string' ? record.year_id : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';

    if (!title || !year_id || !subject_id) {
      return errorResponse(400, 'validation_error', 'title, year_id, and subject_id are required');
    }

    if (!store.getJSON(yearKey(year_id))) {
      return notFoundResponse('Year not found');
    }

    const rawSubject = store.getJSON(subjectKey(subject_id));
    if (!rawSubject) return notFoundResponse('Subject not found');

    const timestamp = nowIso();
    const id = newId('unit');
    const candidate: Unit = {
      id,
      type: 'unit',
      title,
      slug: slugify(title),
      year_id,
      subject_id,
      lesson_ids: [],
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = UnitSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid', validated.error.flatten());
    }

    const subjectParsed = SubjectSchema.safeParse(rawSubject);
    if (!subjectParsed.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    const updatedSubject = SubjectSchema.safeParse({
      ...subjectParsed.data,
      unit_ids: [...subjectParsed.data.unit_ids, id],
      updated_at: timestamp
    });
    if (!updatedSubject.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    store.setJSON(unitKey(id), validated.data);
    store.setJSON(subjectKey(subject_id), updatedSubject.data);
    seedIds.units.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostLesson(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const unit_id = typeof record.unit_id === 'string' ? record.unit_id : '';

    if (!title || !unit_id) {
      return errorResponse(400, 'validation_error', 'title and unit_id are required');
    }

    const rawUnit = store.getJSON(unitKey(unit_id));
    if (!rawUnit) return notFoundResponse('Unit not found');
    const unitParsed = UnitSchema.safeParse(rawUnit);
    if (!unitParsed.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    let maxSequence = 0;
    for (const lessonId of unitParsed.data.lesson_ids) {
      const lesson = store.getJSON<Lesson>(draftLessonKey(lessonId));
      if (lesson && typeof lesson.sequence === 'number' && lesson.sequence > maxSequence) {
        maxSequence = lesson.sequence;
      }
    }

    const timestamp = nowIso();
    const id = newId('lesson');
    const candidate: Lesson = {
      id,
      type: 'lesson',
      title,
      slug: slugify(title),
      unit_id,
      sequence: maxSequence + 1,
      blocks: [],
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = LessonSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(400, 'validation_error', 'Lesson data is invalid', validated.error.flatten());
    }

    const updatedUnit = UnitSchema.safeParse({
      ...unitParsed.data,
      lesson_ids: [...unitParsed.data.lesson_ids, id],
      updated_at: timestamp
    });
    if (!updatedUnit.success) {
      return errorResponse(400, 'validation_error', 'Unit data is invalid');
    }

    store.setJSON(draftLessonKey(id), validated.data);
    store.setJSON(unitKey(unit_id), updatedUnit.data);
    seedIds.lessons.push(id);
    return okResponse(201, validated.data);
  }

  function handlePostScopeSequence(
    cookie: string | null | undefined,
    body: unknown
  ): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const subject_id = typeof record.subject_id === 'string' ? record.subject_id : '';
    const academic_year =
      typeof record.academic_year === 'number' && Number.isInteger(record.academic_year)
        ? record.academic_year
        : NaN;

    if (!title || !subject_id || !Number.isFinite(academic_year)) {
      return errorResponse(
        400,
        'validation_error',
        'title, subject_id, and academic_year are required'
      );
    }

    const rawSubject = store.getJSON(subjectKey(subject_id));
    if (!rawSubject) return notFoundResponse('Subject not found');
    const subjectParsed = SubjectSchema.safeParse(rawSubject);
    if (!subjectParsed.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    const week_count = 40;
    const timestamp = nowIso();
    const id = newId('scope');
    const candidate: ScopeSequence = {
      id,
      type: 'scope_sequence',
      title,
      slug: slugify(title),
      subject_id,
      academic_year,
      week_count,
      terms: defaultScopeTerms(week_count),
      timeline_items: [],
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = ScopeSequenceSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Scope sequence data is invalid',
        validated.error.flatten()
      );
    }

    const updatedSubject = SubjectSchema.safeParse({
      ...subjectParsed.data,
      scope_id: id,
      updated_at: timestamp
    });
    if (!updatedSubject.success) {
      return errorResponse(400, 'validation_error', 'Subject data is invalid');
    }

    store.setJSON(scopeSequenceKey(id), validated.data);
    store.setJSON(subjectKey(subject_id), updatedSubject.data);
    seedIds.scope_sequences.push(id);
    return okResponse(201, validated.data);
  }

  function listCompositionSummaries(): CompositionSummary[] {
    return store
      .listKeys('templates/compositions/')
      .map((key) => store.getJSON<CompositionTemplate>(key))
      .filter((entry): entry is CompositionTemplate => {
        if (!entry) return false;
        const parsed = CompositionTemplateSchema.safeParse(entry);
        return parsed.success && parsed.data.status === 'active';
      })
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        updated_at: entry.updated_at
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function handleGetCompositions(cookie: string | null | undefined): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();
    return okResponse(200, { compositions: listCompositionSummaries() });
  }

  function handlePostComposition(cookie: string | null | undefined, body: unknown): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'validation_error', 'Request body must be a JSON object');
    }

    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) {
      return errorResponse(400, 'validation_error', 'title is required');
    }

    const rootParsed = SectionBlockSchema.safeParse(record.root);
    if (!rootParsed.success) {
      return errorResponse(
        400,
        'validation_error',
        'root must be a section block',
        rootParsed.error.flatten()
      );
    }

    const timestamp = nowIso();
    const id = newId('composition');
    const candidate: CompositionTemplate = {
      id,
      type: 'composition_template',
      title,
      slug: slugify(title),
      status: 'active',
      root: structuredClone(rootParsed.data),
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    const validated = CompositionTemplateSchema.safeParse(candidate);
    if (!validated.success) {
      return errorResponse(
        400,
        'validation_error',
        'Composition data is invalid',
        validated.error.flatten()
      );
    }

    store.setJSON(compositionKey(id), validated.data);
    return okResponse(201, validated.data);
  }

  function handleGetComposition(cookie: string | null | undefined, id: string): MockResponse {
    const session = getSession(cookie);
    if (!session.authenticated) return unauthorizedResponse();

    const raw = store.getJSON<CompositionTemplate>(compositionKey(id));
    if (!raw) return notFoundResponse('Composition not found');

    const parsed = CompositionTemplateSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(500, 'invalid_data', 'Stored composition is invalid');
    }

    return okResponse(200, parsed.data);
  }

  const LESSON_ID_RE = /^\/api\/lessons\/([^/]+)$/;
  const LESSON_PUBLISH_RE = /^\/api\/lessons\/([^/]+)\/publish$/;
  const PUBLISHED_LESSON_RE = /^\/api\/published\/lessons\/([^/]+)$/;
  const PUBLISHED_UNIT_RE = /^\/api\/published\/units\/([^/]+)$/;
  const PUBLISHED_CLASS_RE = /^\/api\/published\/classes\/([^/]+)$/;
  const CLASS_PATCH_RE = /^\/api\/classes\/([^/]+)$/;
  const SCOPE_SEQUENCE_PATCH_RE = /^\/api\/scope-sequences\/([^/]+)$/;
  const SCHEDULE_UNIT_RE = /^\/api\/classes\/([^/]+)\/schedule-unit$/;
  const SCHEDULED_LESSON_RE = /^\/api\/scheduled-lessons\/([^/]+)$/;
  const COMPOSITION_ID_RE = /^\/api\/compositions\/([^/]+)$/;

  async function handle(
    method: string,
    path: string,
    cookie: string | null | undefined,
    body: unknown
  ): Promise<MockResponse> {
    if (method === 'POST' && path === '/api/auth') return handleAuth(body);
    if (method === 'GET' && path === '/api/session') return handleSession(cookie);
    if (method === 'POST' && path === '/api/logout') return handleLogout();
    if (method === 'GET' && path === '/api/curriculum') return handleGetCurriculum(cookie);

    if (method === 'POST' && path === '/api/html-app-ai') {
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'bad_request', 'Invalid JSON body');
      }
      const req = body as {
        lesson_id?: unknown;
        block_id?: unknown;
        messages?: unknown;
      };
      if (
        typeof req.lesson_id !== 'string' ||
        typeof req.block_id !== 'string' ||
        !Array.isArray(req.messages)
      ) {
        return errorResponse(400, 'bad_request', 'lesson_id, block_id, and messages are required');
      }
      return okResponse(200, { text: 'mock-ai-reply' });
    }

    if (method === 'POST' && path === '/api/classes') return handlePostClass(cookie, body);
    if (method === 'POST' && path === '/api/units') return handlePostUnit(cookie, body);
    if (method === 'POST' && path === '/api/lessons') return handlePostLesson(cookie, body);
    if (method === 'POST' && path === '/api/scope-sequences') {
      return handlePostScopeSequence(cookie, body);
    }
    if (method === 'GET' && path === '/api/compositions') return handleGetCompositions(cookie);
    if (method === 'POST' && path === '/api/compositions') return handlePostComposition(cookie, body);

    const compositionMatch = COMPOSITION_ID_RE.exec(path);
    if (compositionMatch && method === 'GET') {
      return handleGetComposition(cookie, compositionMatch[1]!);
    }

    const publishMatch = LESSON_PUBLISH_RE.exec(path);
    if (publishMatch && method === 'POST') {
      return handlePublishLesson(cookie, publishMatch[1]);
    }

    const lessonMatch = LESSON_ID_RE.exec(path);
    if (lessonMatch) {
      if (method === 'GET') return handleGetDraftLesson(cookie, lessonMatch[1]);
      if (method === 'PUT') return handlePutDraftLesson(cookie, lessonMatch[1], body);
    }

    const publishedMatch = PUBLISHED_LESSON_RE.exec(path);
    if (publishedMatch && method === 'GET') {
      return handleGetPublishedLesson(publishedMatch[1]);
    }

    const publishedUnitMatch = PUBLISHED_UNIT_RE.exec(path);
    if (publishedUnitMatch && method === 'GET') {
      return handleGetPublishedUnit(publishedUnitMatch[1]);
    }

    const publishedClassMatch = PUBLISHED_CLASS_RE.exec(path);
    if (publishedClassMatch && method === 'GET') {
      return handleGetPublishedClass(publishedClassMatch[1]);
    }

    const scheduleUnitMatch = SCHEDULE_UNIT_RE.exec(path);
    if (scheduleUnitMatch && method === 'POST') {
      return handleScheduleUnit(cookie, scheduleUnitMatch[1], body);
    }

    const classPatchMatch = CLASS_PATCH_RE.exec(path);
    if (classPatchMatch && method === 'PATCH') {
      return handlePatchClass(cookie, classPatchMatch[1], body);
    }

    const scopeSequencePatchMatch = SCOPE_SEQUENCE_PATCH_RE.exec(path);
    if (scopeSequencePatchMatch && method === 'PATCH') {
      return handlePatchScopeSequence(cookie, scopeSequencePatchMatch[1], body);
    }

    const scheduledLessonMatch = SCHEDULED_LESSON_RE.exec(path);
    if (scheduledLessonMatch && method === 'PATCH') {
      return handlePatchScheduledLesson(cookie, scheduledLessonMatch[1], body);
    }

    return errorResponse(404, 'not_found', `No route for ${method} ${path}`);
  }

  async function request(
    method: string,
    path: string,
    requestOptions: MockApiRequestOptions = {}
  ): Promise<MockResponse> {
    return handle(method.toUpperCase(), path, requestOptions.cookie, requestOptions.body);
  }

  async function readNodeRequestBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return undefined;
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (raw.trim().length === 0) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return { __invalidJson: true };
    }
  }

  async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.url ?? '/';
    const path = url.split('?')[0];
    const cookie = req.headers.cookie ?? null;

    let body: unknown;
    if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
      body = await readNodeRequestBody(req);
    }

    if (body && typeof body === 'object' && '__invalidJson' in body) {
      const response = errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
      return;
    }

    const response = await handle(method, path, cookie, body);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  }

  return { request, handleNodeRequest };
}
