import { z } from 'zod';
import {
  getContentStore,
  getJSON,
  setJSON,
  unitKey
} from './_shared/blobs.mts';
import { getTeacherSession } from './_shared/session.mts';
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
import {
  BlockSchema,
  CoverPatchSchema,
  UnitSchema,
  type Block,
  type Cover,
  type Unit
} from '../../src/schemas';
import { unitContentChanged } from '../../src/recovery/versions';
import {
  CHECKPOINT_AFTER_SAVE_WARNING,
  createNetlifyJsonStore,
  tryWriteCheckpoint
} from './_shared/versions.mts';
import {
  applyParsedStatus,
  handlePermanentDelete,
  LifecycleError,
  parseStatusPatch
} from './_shared/lifecycle-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function parseBody(
  body: unknown
):
  | {
      ok: true;
      title?: string;
      description?: string;
      blocks?: Block[];
      lesson_ids?: string[];
      cover?: Cover | null;
      status?: Unit['status'];
      trash_reason?: string;
    }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  const hasTitle = record.title !== undefined;
  const hasDescription = record.description !== undefined;
  const hasBlocks = record.blocks !== undefined;
  const hasLessonIds = record.lesson_ids !== undefined;
  const hasCover = record.cover !== undefined;
  const statusPatch = parseStatusPatch(body);
  if (!statusPatch.ok) {
    return { ok: false, code: statusPatch.code, message: statusPatch.message };
  }
  const hasStatus = statusPatch.hasStatus;

  if (!hasTitle && !hasDescription && !hasBlocks && !hasLessonIds && !hasCover && !hasStatus) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Provide title, description, blocks, lesson_ids, cover, and/or status'
    };
  }

  let title: string | undefined;
  if (hasTitle) {
    if (typeof record.title !== 'string' || !record.title.trim()) {
      return { ok: false, code: 'validation_error', message: 'title must be a non-empty string' };
    }
    title = record.title.trim();
  }

  let description: string | undefined;
  if (hasDescription) {
    if (typeof record.description !== 'string') {
      return { ok: false, code: 'validation_error', message: 'description must be a string' };
    }
    description = record.description;
  }

  let blocks: Block[] | undefined;
  if (hasBlocks) {
    const parsed = z.array(BlockSchema).safeParse(record.blocks);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', message: 'blocks are invalid' };
    }
    blocks = parsed.data;
  }

  let lesson_ids: string[] | undefined;
  if (hasLessonIds) {
    const parsed = z.array(z.string().min(1)).safeParse(record.lesson_ids);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', message: 'lesson_ids are invalid' };
    }
    lesson_ids = parsed.data;
  }

  let cover: Cover | null | undefined;
  if (hasCover) {
    const parsed = CoverPatchSchema.safeParse(record.cover);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', message: 'cover is invalid' };
    }
    cover = parsed.data;
  }

  return {
    ok: true,
    title,
    description,
    blocks,
    lesson_ids,
    cover,
    status: statusPatch.status,
    trash_reason: statusPatch.trash_reason
  };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }

  if (request.method === 'DELETE') {
    return handlePermanentDelete(request, context, 'unit');
  }

  if (request.method !== 'PATCH') {
    return withCors(methodNotAllowed('PATCH, DELETE, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return withCors(errorResponse(400, parsed.code, parsed.message), request, env);
  }

  const store = getContentStore();
  const rawUnit = await getJSON(store, unitKey(id));
  if (!rawUnit) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }

  const unitParsed = UnitSchema.safeParse(rawUnit);
  if (!unitParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  const nowIso = new Date().toISOString();
  let merged: Record<string, unknown> = {
    ...unitParsed.data,
    updated_at: nowIso
  };

  if (parsed.title !== undefined) {
    merged.title = parsed.title;
  }
  if (parsed.description !== undefined) {
    merged.description = parsed.description;
  }
  if (parsed.blocks !== undefined) {
    merged.blocks = parsed.blocks;
  }
  if (parsed.lesson_ids !== undefined) {
    merged.lesson_ids = parsed.lesson_ids;
  }
  if (parsed.cover !== undefined) {
    if (parsed.cover === null) {
      delete merged.cover;
    } else {
      merged.cover = parsed.cover;
    }
  }

  if (parsed.status !== undefined) {
    try {
      merged = applyParsedStatus(merged as Unit, parsed, nowIso) as Record<string, unknown>;
      merged.updated_at = nowIso;
    } catch (err) {
      if (err instanceof LifecycleError) {
        return withCors(errorResponse(400, err.code, err.message), request, env);
      }
      throw err;
    }
  }

  const validated = UnitSchema.safeParse(merged);
  if (!validated.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  await setJSON(store, unitKey(id), validated.data as Unit);

  let warning: string | undefined;
  if (unitContentChanged(unitParsed.data, validated.data)) {
    const checkpointed = await tryWriteCheckpoint(createNetlifyJsonStore(store), {
      kind: 'unit',
      parentId: id,
      snapshot: validated.data,
      reason: 'save',
      now: nowIso
    });
    if (!checkpointed.ok) warning = CHECKPOINT_AFTER_SAVE_WARNING;
  }

  return withCors(
    okResponse(200, validated.data, {}, warning ? { warning } : undefined),
    request,
    env
  );
}

export const config = { path: '/api/units/:id' };
