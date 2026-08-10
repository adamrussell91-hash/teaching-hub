import { getContentStore, getJSON, mediaFileKey, mediaKey, setJSON } from './_shared/blobs.mts';
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
  ALLOWED_MEDIA_MIME,
  MAX_MEDIA_BYTES,
  mediaTypeFromMime
} from '../../src/media/upload-rules';
import { MediaSchema, type Media } from '../../src/schemas';

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return withCors(
      errorResponse(400, 'validation_error', 'Request body must be multipart form data'),
      request,
      env
    );
  }

  const fileEntry = form.get('file');
  if (!(fileEntry instanceof File)) {
    return withCors(errorResponse(400, 'validation_error', 'file is required'), request, env);
  }

  const mime = (fileEntry.type || '').trim();
  if (!mime || !ALLOWED_MEDIA_MIME.has(mime)) {
    return withCors(
      errorResponse(400, 'validation_error', 'File MIME type is not allowed'),
      request,
      env
    );
  }

  if (fileEntry.size > MAX_MEDIA_BYTES) {
    return withCors(
      errorResponse(400, 'validation_error', `File exceeds maximum size of ${MAX_MEDIA_BYTES} bytes`),
      request,
      env
    );
  }

  const titleField = form.get('title');
  const titleFromForm =
    typeof titleField === 'string' && titleField.trim() ? titleField.trim() : '';
  const title = titleFromForm || fileEntry.name.trim() || 'Untitled';

  const providerFileIdField = form.get('provider_file_id');
  let provider_file_id: string | undefined;
  if (providerFileIdField !== null && providerFileIdField !== undefined) {
    if (typeof providerFileIdField !== 'string' || !providerFileIdField.trim()) {
      return withCors(
        errorResponse(400, 'validation_error', 'provider_file_id must be a non-empty string when provided'),
        request,
        env
      );
    }
    provider_file_id = providerFileIdField.trim();
  }

  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const id = newId('media');
  const fileUrl = new URL(`/api/media/${id}/file`, request.url).href;
  const timestamp = new Date().toISOString();

  const candidate: Media = {
    id,
    type: 'media',
    title,
    slug: slugify(title),
    status: 'active',
    provider: 'direct',
    media_type: mediaTypeFromMime(mime),
    mime_type: mime,
    file_name: fileEntry.name || undefined,
    preview_url: fileUrl,
    download_url: fileUrl,
    sharing: 'public_link',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1,
    ...(provider_file_id !== undefined ? { provider_file_id } : {})
  };

  const validated = MediaSchema.safeParse(candidate);
  if (!validated.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Media data is invalid', validated.error.flatten()),
      request,
      env
    );
  }

  const store = getContentStore();
  await store.set(mediaFileKey(id), bytes, { metadata: { contentType: mime } });
  await setJSON(store, mediaKey(id), validated.data);

  return withCors(okResponse(201, validated.data), request, env);
}

export const config = { path: '/api/media/upload' };
