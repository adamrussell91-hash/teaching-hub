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
  UnitSchema,
  type Block,
  type Unit
} from '../../src/schemas';
import { createNetlifyJsonStore, writeCheckpoint } from './_shared/versions.mts';

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

  if (!hasTitle && !hasDescription && !hasBlocks && !hasLessonIds) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Provide title, description, blocks, and/or lesson_ids'
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

  return { ok: true, title, description, blocks, lesson_ids };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Unit not found'), request, env);
  }
  if (request.method !== 'PATCH') {
    return withCors(methodNotAllowed('PATCH, OPTIONS'), request, env);
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
  const merged: Record<string, unknown> = {
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

  const validated = UnitSchema.safeParse(merged);
  if (!validated.success) {
    return withCors(errorResponse(400, 'validation_error', 'Unit data is invalid'), request, env);
  }

  await setJSON(store, unitKey(id), validated.data as Unit);

  // Meaningful content PATCH (not status-only) → checkpoint full unit.
  await writeCheckpoint(createNetlifyJsonStore(store), {
    kind: 'unit',
    parentId: id,
    snapshot: validated.data,
    reason: 'save',
    now: nowIso
  });

  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/units/:id' };
