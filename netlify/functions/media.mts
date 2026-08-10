import { getContentStore, mediaKey, setJSON } from './_shared/blobs.mts';
import { newId, slugify } from './_shared/create-helpers.mts';
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
  MediaTypeSchema,
  type Media
} from '../../src/schemas';
import { optionalNonEmptyString } from './_shared/media-fields.mts';

const CREATE_PROVIDERS = new Set(['external', 'google_drive']);

export default async function handler(request: Request): Promise<Response> {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  if (typeof body !== 'object' || body === null) {
    return withCors(
      errorResponse(400, 'validation_error', 'Request body must be a JSON object'),
      request,
      env
    );
  }

  const record = body as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    return withCors(errorResponse(400, 'validation_error', 'title is required'), request, env);
  }

  const provider = typeof record.provider === 'string' ? record.provider : '';
  if (!CREATE_PROVIDERS.has(provider)) {
    return withCors(
      errorResponse(
        400,
        'validation_error',
        'provider must be external or google_drive (direct uploads use /api/media/upload)'
      ),
      request,
      env
    );
  }

  const mediaTypeParsed = MediaTypeSchema.safeParse(record.media_type);
  if (!mediaTypeParsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'media_type is required and must be a valid media type'),
      request,
      env
    );
  }

  const optionalKeys = [
    'preview_url',
    'download_url',
    'thumbnail_url',
    'provider_file_id',
    'mime_type',
    'file_name'
  ] as const;
  const optionals: Partial<
    Pick<
      Media,
      | 'preview_url'
      | 'download_url'
      | 'thumbnail_url'
      | 'provider_file_id'
      | 'mime_type'
      | 'file_name'
    >
  > = {};

  for (const key of optionalKeys) {
    const value = optionalNonEmptyString(record, key);
    if (value && typeof value === 'object' && 'error' in value) {
      return withCors(errorResponse(400, 'validation_error', value.error), request, env);
    }
    if (typeof value === 'string') {
      optionals[key] = value;
    }
  }

  let sharing: Media['sharing'];
  if (record.sharing !== undefined) {
    const sharingParsed = MediaSharingSchema.safeParse(record.sharing);
    if (!sharingParsed.success) {
      return withCors(errorResponse(400, 'validation_error', 'sharing is invalid'), request, env);
    }
    sharing = sharingParsed.data;
  }

  const timestamp = new Date().toISOString();
  const id = newId('media');
  const candidate: Media = {
    id,
    type: 'media',
    title,
    slug: slugify(title),
    status: 'active',
    provider: provider as 'external' | 'google_drive',
    media_type: mediaTypeParsed.data,
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1,
    ...optionals,
    ...(sharing !== undefined ? { sharing } : {})
  };

  const validated = MediaSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Media data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  await setJSON(getContentStore(), mediaKey(id), validated.data);
  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/media' };
