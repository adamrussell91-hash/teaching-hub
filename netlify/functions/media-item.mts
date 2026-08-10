import { getContentStore, getJSON, mediaKey, setJSON } from './_shared/blobs.mts';
import { slugify } from './_shared/create-helpers.mts';
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
  MediaSchema,
  MediaSharingSchema,
  StatusSchema,
  type Media
} from '../../src/schemas';
import { optionalNonEmptyString } from './_shared/media-fields.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

function parsePatchBody(
  body: unknown
):
  | {
      ok: true;
      title?: string;
      status?: Media['status'];
      preview_url?: string;
      download_url?: string;
      thumbnail_url?: string;
      provider_file_id?: string;
      sharing?: Media['sharing'];
      mime_type?: string;
      file_name?: string;
    }
  | { ok: false; code: string; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }

  const record = body as Record<string, unknown>;
  const result: {
    title?: string;
    status?: Media['status'];
    preview_url?: string;
    download_url?: string;
    thumbnail_url?: string;
    provider_file_id?: string;
    sharing?: Media['sharing'];
    mime_type?: string;
    file_name?: string;
  } = {};

  if (record.title !== undefined) {
    if (typeof record.title !== 'string' || !record.title.trim()) {
      return { ok: false, code: 'validation_error', message: 'title must be a non-empty string' };
    }
    result.title = record.title.trim();
  }

  if (record.status !== undefined) {
    const statusParsed = StatusSchema.safeParse(record.status);
    if (!statusParsed.success) {
      return {
        ok: false,
        code: 'validation_error',
        message: 'status must be active, archived, or trashed'
      };
    }
    result.status = statusParsed.data;
  }

  for (const key of [
    'preview_url',
    'download_url',
    'thumbnail_url',
    'provider_file_id',
    'mime_type',
    'file_name'
  ] as const) {
    const value = optionalNonEmptyString(record, key);
    if (value && typeof value === 'object' && 'error' in value) {
      return { ok: false, code: 'validation_error', message: value.error };
    }
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  if (record.sharing !== undefined) {
    const sharingParsed = MediaSharingSchema.safeParse(record.sharing);
    if (!sharingParsed.success) {
      return { ok: false, code: 'validation_error', message: 'sharing is invalid' };
    }
    result.sharing = sharingParsed.data;
  }

  if (
    result.title === undefined &&
    result.status === undefined &&
    result.preview_url === undefined &&
    result.download_url === undefined &&
    result.thumbnail_url === undefined &&
    result.provider_file_id === undefined &&
    result.sharing === undefined &&
    result.mime_type === undefined &&
    result.file_name === undefined
  ) {
    return {
      ok: false,
      code: 'validation_error',
      message:
        'Provide title, status, preview_url, download_url, thumbnail_url, provider_file_id, sharing, mime_type, and/or file_name'
    };
  }

  return { ok: true, ...result };
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return withCors(methodNotAllowed('GET, PATCH, OPTIONS'), request, env);
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
    return withCors(errorResponse(404, 'not_found', 'Media not found'), request, env);
  }

  const store = getContentStore();
  const raw = await getJSON(store, mediaKey(id));
  if (!raw) {
    return withCors(errorResponse(404, 'not_found', 'Media not found'), request, env);
  }

  const existing = MediaSchema.safeParse(raw);
  if (!existing.success) {
    return withCors(errorResponse(500, 'invalid_data', 'Stored media is invalid'), request, env);
  }

  if (request.method === 'GET') {
    return withCors(okResponse(200, existing.data), request, env);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  const parsed = parsePatchBody(body);
  if (!parsed.ok) {
    return withCors(errorResponse(400, parsed.code, parsed.message), request, env);
  }

  const merged: Media = {
    ...existing.data,
    updated_at: new Date().toISOString()
  };

  if (parsed.title !== undefined) {
    merged.title = parsed.title;
    merged.slug = slugify(parsed.title);
  }
  if (parsed.status !== undefined) merged.status = parsed.status;
  if (parsed.preview_url !== undefined) merged.preview_url = parsed.preview_url;
  if (parsed.download_url !== undefined) merged.download_url = parsed.download_url;
  if (parsed.thumbnail_url !== undefined) merged.thumbnail_url = parsed.thumbnail_url;
  if (parsed.provider_file_id !== undefined) merged.provider_file_id = parsed.provider_file_id;
  if (parsed.sharing !== undefined) merged.sharing = parsed.sharing;
  if (parsed.mime_type !== undefined) merged.mime_type = parsed.mime_type;
  if (parsed.file_name !== undefined) merged.file_name = parsed.file_name;

  const validated = MediaSchema.safeParse(merged);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Media data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(store, mediaKey(id), validated.data);
  return withCors(okResponse(200, validated.data), request, env);
}

export const config = { path: '/api/media/:id' };
