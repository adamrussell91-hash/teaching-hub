import {
  getContentStore,
  getJSON,
  scopeSequenceKey,
  setJSON
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
  ScopeSequenceSchema,
  TimelineItemSchema,
  type TimelineItem
} from '../../src/schemas';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function parseTimelineItems(
  body: unknown,
  weekCount: number
):
  | { ok: true; timeline_items: TimelineItem[] }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  if (record.timeline_items === undefined) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Provide timeline_items'
    };
  }

  if (!Array.isArray(record.timeline_items)) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'timeline_items must be an array'
    };
  }

  const timeline_items: TimelineItem[] = [];
  const seenUnitIds = new Set<string>();

  for (const raw of record.timeline_items) {
    const parsed = TimelineItemSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'timeline_items contains an invalid item'
      };
    }

    const item = parsed.data;
    if (item.start_week < 1 || item.end_week > weekCount) {
      return {
        ok: false,
        code: 'validation_error',
        message: `timeline item weeks must be between 1 and ${weekCount}`
      };
    }

    if (item.kind === 'unit') {
      if (seenUnitIds.has(item.unit_id)) {
        return {
          ok: false,
          code: 'validation_error',
          message: 'unit_id must be unique among unit timeline items'
        };
      }
      seenUnitIds.add(item.unit_id);
    }

    timeline_items.push(item);
  }

  return { ok: true, timeline_items };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(errorResponse(404, 'not_found', 'Scope sequence not found'), request, env);
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

  const store = getContentStore();
  const rawScope = await getJSON(store, scopeSequenceKey(id));
  if (!rawScope) {
    return withCors(errorResponse(404, 'not_found', 'Scope sequence not found'), request, env);
  }

  const scopeParsed = ScopeSequenceSchema.safeParse(rawScope);
  if (!scopeParsed.success) {
    return withCors(errorResponse(400, 'validation_error', 'Scope sequence data is invalid'), request, env);
  }

  const parsed = parseTimelineItems(body, scopeParsed.data.week_count);
  if (!parsed.ok) {
    return withCors(errorResponse(400, parsed.code, parsed.message), request, env);
  }

  const nowIso = new Date().toISOString();
  const merged = {
    ...scopeParsed.data,
    timeline_items: parsed.timeline_items,
    updated_at: nowIso
  };

  const validated = ScopeSequenceSchema.safeParse(merged);
  if (!validated.success) {
    return withCors(errorResponse(400, 'validation_error', 'Scope sequence data is invalid'), request, env);
  }

  await setJSON(store, scopeSequenceKey(id), validated.data);

  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/scope-sequences/:id' };
