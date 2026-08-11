import { StatusSchema } from '../../../src/schemas';
import type { EntityStatus, LifecycleFields } from '../../../src/recovery/lifecycle';
import { getContentStore } from './blobs.mts';
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
import { createNetlifyJsonStore } from './versions.mts';
import {
  applyStatusTransition,
  collectionToType,
  entityKey,
  entityNotFoundMessage,
  LifecycleError,
  listTrash,
  permanentDelete,
  restoreEntityFromTrash,
  scanDependencies,
  type LifecycleEntityType
} from './lifecycle.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function mapLifecycleError(err: unknown): Response {
  if (err instanceof LifecycleError) {
    if (err.code === 'not_found') {
      return errorResponse(404, 'not_found', err.message);
    }
    if (err.code === 'has_dependencies') {
      return errorResponse(409, 'conflict', err.message, {
        dependencies: err.dependencies ?? []
      });
    }
    return errorResponse(400, err.code, err.message);
  }
  throw err;
}

function resolveType(
  context: FunctionContext,
  request: Request,
  fixedType?: LifecycleEntityType
): LifecycleEntityType | null {
  if (fixedType) return fixedType;
  const collection = context.params.collection;
  if (collection) return collectionToType(collection);
  try {
    const pathname = new URL(request.url).pathname;
    const match = /^\/api\/([^/]+)\//.exec(pathname);
    if (match) return collectionToType(match[1]!);
  } catch {
    // ignore
  }
  return null;
}

export async function handleTrashList(request: Request): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
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

  const summaries = await listTrash(createNetlifyJsonStore(getContentStore()));
  return withCors(okResponse(200, summaries), request, env);
}

export async function handleRestoreFromTrash(
  request: Request,
  context: FunctionContext,
  fixedType?: LifecycleEntityType
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
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

  const id = context.params.id;
  const type = resolveType(context, request, fixedType);
  if (!id || !type) {
    return withCors(errorResponse(404, 'not_found', 'Not found'), request, env);
  }

  try {
    const updated = await restoreEntityFromTrash(
      createNetlifyJsonStore(getContentStore()),
      type,
      id
    );
    return withCors(okResponse(200, updated), request, env);
  } catch (err) {
    return withCors(mapLifecycleError(err), request, env);
  }
}

export async function handleDependencies(
  request: Request,
  context: FunctionContext,
  fixedType?: LifecycleEntityType
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
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

  const id = context.params.id;
  const type = resolveType(context, request, fixedType);
  if (!id || !type) {
    return withCors(errorResponse(404, 'not_found', 'Not found'), request, env);
  }

  const store = createNetlifyJsonStore(getContentStore());
  const existing = await store.getJSON(entityKey(type, id));
  if (!existing) {
    return withCors(errorResponse(404, 'not_found', entityNotFoundMessage(type)), request, env);
  }

  const dependencies = await scanDependencies(store, type, id);
  return withCors(okResponse(200, { dependencies }), request, env);
}

export async function handlePermanentDelete(
  request: Request,
  context: FunctionContext,
  fixedType: LifecycleEntityType
): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'DELETE') {
    return withCors(methodNotAllowed('DELETE, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', entityNotFoundMessage(fixedType)), request, env);
  }

  try {
    await permanentDelete(createNetlifyJsonStore(getContentStore()), fixedType, id);
    return withCors(okResponse(200, { deleted: true }), request, env);
  } catch (err) {
    return withCors(mapLifecycleError(err), request, env);
  }
}

export function parseStatusPatch(
  body: unknown
):
  | { ok: true; status?: EntityStatus; trash_reason?: string; hasStatus: boolean }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  let status: EntityStatus | undefined;
  if (record.status !== undefined) {
    const parsed = StatusSchema.safeParse(record.status);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'status must be active, archived, or trashed'
      };
    }
    status = parsed.data;
  }
  let trash_reason: string | undefined;
  if (record.trash_reason !== undefined) {
    if (typeof record.trash_reason !== 'string' || !record.trash_reason.trim()) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'trash_reason must be a non-empty string when provided'
      };
    }
    trash_reason = record.trash_reason.trim();
  }
  return { ok: true, status, trash_reason, hasStatus: status !== undefined };
}

export function applyParsedStatus<T extends LifecycleFields>(
  obj: T,
  parsed: { status?: EntityStatus; trash_reason?: string },
  now: string
): T {
  if (parsed.status === undefined) return obj;
  return applyStatusTransition(obj, parsed.status, now, parsed.trash_reason);
}

export { LifecycleError, applyStatusTransition };
