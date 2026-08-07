import { draftLessonKey, getContentStore, getJSON, publishedLessonKey, setJSON } from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import { PublishedLessonSchema, toPublishedLesson, validatePublishableLesson, type Lesson } from './_shared/validate.mts';
import { filterBlocksForStudent } from '../../src/blocks/visibility';
import { sanitizeRichTextHtml } from '../../src/blocks/sanitize';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

// `sanitizeRichTextHtml` relies on the browser `DOMParser`/`Node` globals,
// which Netlify's Node.js function runtime does not provide. Polyfill
// lazily with happy-dom — same pattern as `scripts/mock-api.ts`.
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

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
  if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const store = getContentStore();
  const draft = await getJSON<Lesson>(store, draftLessonKey(id));
  if (!draft) return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);

  const validated = validatePublishableLesson(draft);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Lesson is not publishable', validated.issues),
      request,
      env
    );
  }

  await ensureDomPolyfill();

  const publishedAt = new Date().toISOString();
  const fullSnapshot = toPublishedLesson(validated.data, publishedAt);
  const studentBlocks = filterBlocksForStudent(fullSnapshot.blocks).map((block) => {
    if (block.block_type === 'rich_text') {
      return { ...block, content: { html: sanitizeRichTextHtml(block.content.html) } };
    }
    return block;
  });
  const studentSnapshot = PublishedLessonSchema.parse({ ...fullSnapshot, blocks: studentBlocks });

  await setJSON(store, publishedLessonKey(id), studentSnapshot);
  return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
}

export const config = { path: '/api/lessons/:id/publish' };
