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
  homeScheduleKey
} from '../src/storage/keys';
import {
  LessonSchema,
  PublishableLessonSchema,
  PublishedLessonSchema,
  toPublishedLesson,
  type Lesson
} from '../src/schemas';
import { orderLessonsByUnitIds } from '../src/schemas/published-unit';
import { filterBlocksForStudent } from '../src/blocks/visibility';
import { sanitizeRichTextHtml } from '../src/blocks/sanitize';

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

interface ScheduleEntry {
  class_id: string;
  class_title: string;
  lesson_id: string;
  scheduled_date: string;
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
    lessons: options.seed.lessons.map((l) => (l as { id: string }).id)
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

    const homeSchedule = store.getJSON<{
      anchor_date: string;
      entries: ScheduleEntry[];
    }>(homeScheduleKey());
    const schedule = homeSchedule?.entries ?? [];

    return {
      years,
      subjects,
      units,
      lessons,
      schedule,
      schedule_anchor_date: homeSchedule?.anchor_date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
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
    const studentBlocks = filterBlocksForStudent(fullSnapshot.blocks).map((block) => {
      if (block.block_type === 'rich_text' || block.block_type === 'html') {
        return {
          ...block,
          content: { html: sanitizeRichTextHtml(block.content.html) }
        };
      }
      return block;
    });

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

  const LESSON_ID_RE = /^\/api\/lessons\/([^/]+)$/;
  const LESSON_PUBLISH_RE = /^\/api\/lessons\/([^/]+)\/publish$/;
  const PUBLISHED_LESSON_RE = /^\/api\/published\/lessons\/([^/]+)$/;
  const PUBLISHED_UNIT_RE = /^\/api\/published\/units\/([^/]+)$/;

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
    if (method === 'PUT' || method === 'POST') {
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
