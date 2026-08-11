import type { VersionKind } from '../../../src/schemas';
import {
  classKey,
  draftLessonKey,
  getContentStore,
  getJSON,
  unitKey
} from './blobs.mts';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  withCors
} from './http.mts';
import { getTeacherSession } from './session.mts';
import {
  createNetlifyJsonStore,
  getVersion,
  listVersionIndex,
  restoreVersion,
  VersionStoreError,
  writeCheckpoint
} from './versions.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function parseRevision(raw: string | undefined): number | null {
  if (!raw) return null;
  const revision = Number(raw);
  if (!Number.isInteger(revision) || revision < 1) return null;
  return revision;
}

function liveKey(kind: VersionKind, parentId: string): string {
  if (kind === 'lesson') return draftLessonKey(parentId);
  if (kind === 'unit') return unitKey(parentId);
  return classKey(parentId);
}

function parentNotFoundMessage(kind: VersionKind): string {
  if (kind === 'lesson') return 'Lesson not found';
  if (kind === 'unit') return 'Unit not found';
  return 'Class not found';
}

async function loadLiveSnapshot(
  kind: VersionKind,
  parentId: string
): Promise<{ ok: true; snapshot: unknown } | { ok: false; response: Response }> {
  const store = getContentStore();
  const live = await getJSON(store, liveKey(kind, parentId));
  if (!live) {
    return {
      ok: false,
      response: errorResponse(404, 'not_found', parentNotFoundMessage(kind))
    };
  }

  if (kind === 'class_homepage') {
    const homepage =
      live && typeof live === 'object' && 'homepage' in live
        ? (live as { homepage?: unknown }).homepage
        : undefined;
    return { ok: true, snapshot: { homepage } };
  }

  return { ok: true, snapshot: live };
}

function mapVersionError(err: unknown): Response {
  if (err instanceof VersionStoreError) {
    const status = err.code === 'not_found' ? 404 : 400;
    return errorResponse(status, err.code, err.message, err.details);
  }
  throw err;
}

export async function handleVersionCollection(
  request: Request,
  context: FunctionContext,
  kind: VersionKind
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', parentNotFoundMessage(kind)), request, env);
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const jsonStore = createNetlifyJsonStore(getContentStore());

  if (request.method === 'GET') {
    const index = await listVersionIndex(jsonStore, kind, id);
    return withCors(okResponse(200, index), request, env);
  }

  let label: string | undefined;
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && typeof (body as { label?: unknown }).label === 'string') {
        const trimmed = (body as { label: string }).label.trim();
        if (trimmed) label = trimmed;
      }
    } catch {
      return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
    }
  }

  const loaded = await loadLiveSnapshot(kind, id);
  if (!loaded.ok) return withCors(loaded.response, request, env);

  try {
    const record = await writeCheckpoint(jsonStore, {
      kind,
      parentId: id,
      snapshot: loaded.snapshot,
      reason: 'manual_checkpoint',
      label
    });
    return withCors(okResponse(200, record), request, env);
  } catch (err) {
    console.error('manual writeCheckpoint failed', err);
    return withCors(
      errorResponse(
        500,
        'checkpoint_failed',
        'Version history checkpoint failed. The live document was not modified.'
      ),
      request,
      env
    );
  }
}

export async function handleVersionItem(
  request: Request,
  context: FunctionContext,
  kind: VersionKind
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  const revision = parseRevision(context.params.revision);
  if (!id || revision === null) {
    return withCors(errorResponse(404, 'not_found', 'Version not found'), request, env);
  }
  if (request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const record = await getVersion(createNetlifyJsonStore(getContentStore()), kind, id, revision);
  if (!record) {
    return withCors(errorResponse(404, 'not_found', 'Version not found'), request, env);
  }
  return withCors(okResponse(200, record), request, env);
}

export async function handleVersionRestore(
  request: Request,
  context: FunctionContext,
  kind: VersionKind
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  const revision = parseRevision(context.params.revision);
  if (!id || revision === null) {
    return withCors(errorResponse(404, 'not_found', 'Version not found'), request, env);
  }
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  try {
    const live = await restoreVersion(createNetlifyJsonStore(getContentStore()), {
      kind,
      parentId: id,
      revision
    });
    return withCors(okResponse(200, live), request, env);
  } catch (err) {
    return withCors(mapVersionError(err), request, env);
  }
}
