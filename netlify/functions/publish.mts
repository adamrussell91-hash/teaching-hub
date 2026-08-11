import {
  compositionKey,
  draftLessonKey,
  getContentStore,
  getJSON,
  publishedLessonKey,
  setJSON
} from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
import { PublishedLessonSchema, toPublishedLesson, validatePublishableLesson, type Lesson } from './_shared/validate.mts';
import { filterBlocksForStudent } from '../../src/blocks/visibility';
import { sanitizeBlocksDeep } from '../../src/blocks/sanitize-blocks';
import { isLinkedSection } from '../../src/blocks/composition-link';
import {
  LinkedResolveError,
  resolveLinkedSectionsForPublish
} from '../../src/blocks/resolve-linked-sections';
import {
  CompositionTemplateSchema,
  type Block,
  type CompositionTemplate
} from '../../src/schemas';
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
import { createNetlifyJsonStore, writeCheckpoint } from './_shared/versions.mts';

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

  const compositionMap = new Map<string, CompositionTemplate>();
  for (const block of validated.data.blocks) {
    if (!isLinkedSection(block)) continue;
    const sourceId = block.content.link.source_composition_id;
    if (compositionMap.has(sourceId)) continue;
    const raw = await getJSON(store, compositionKey(sourceId));
    const composition = CompositionTemplateSchema.safeParse(raw);
    if (composition.success) {
      compositionMap.set(sourceId, composition.data);
    }
  }

  let n = 0;
  let resolvedBlocks: Block[];
  try {
    resolvedBlocks = resolveLinkedSectionsForPublish(
      validated.data.blocks,
      (sourceId) => compositionMap.get(sourceId) ?? null,
      () => `block_pub_${id}_${++n}`
    );
  } catch (err) {
    if (err instanceof LinkedResolveError) {
      return withCors(errorResponse(400, 'validation_error', err.message), request, env);
    }
    throw err;
  }

  await ensureDomPolyfill();

  const publishedAt = new Date().toISOString();
  const lessonForPublish = { ...validated.data, blocks: resolvedBlocks };
  const fullSnapshot = toPublishedLesson(lessonForPublish, publishedAt);
  const studentBlocks = sanitizeBlocksDeep(filterBlocksForStudent(fullSnapshot.blocks));
  const studentSnapshot = PublishedLessonSchema.parse({ ...fullSnapshot, blocks: studentBlocks });

  // Checkpoint the pre-publish draft before writing the published snapshot.
  // Fail closed: do not publish if history checkpointing fails.
  try {
    await writeCheckpoint(createNetlifyJsonStore(store), {
      kind: 'lesson',
      parentId: id,
      snapshot: validated.data,
      reason: 'publish',
      now: publishedAt
    });
  } catch (err) {
    console.error('publish writeCheckpoint failed', err);
    return withCors(
      errorResponse(
        500,
        'checkpoint_failed',
        'Publish aborted: version history checkpoint failed before writing the published snapshot.'
      ),
      request,
      env
    );
  }

  await setJSON(store, publishedLessonKey(id), studentSnapshot);
  // Persist publish timestamp on the draft so reload shows Published / Unpublished changes.
  // Draft keeps linked stubs; only the published snapshot expands them.
  await setJSON(store, draftLessonKey(id), {
    ...validated.data,
    published_at: publishedAt,
    updated_at: publishedAt
  });
  return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
}

export const config = { path: '/api/lessons/:id/publish' };
