import { AiJobPatchSchema, type AiJob } from '../../src/ai/jobs.ts';
import { applyJobResolution } from '../../src/ai/jobs-inbox.ts';
import { writeJobInbox } from './_shared/ai-job-complete.mts';
import { aiJobKey, getContentStore, getJSON, setJSON } from './_shared/blobs.mts';
import { staleWorkingJobError } from '../../src/ai/jobs.ts';
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

interface FunctionContext {
  params: Record<string, string | undefined>;
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
    return withCors(errorResponse(404, 'not_found', 'Job not found'), request, env);
  }

  const store = getContentStore();
  const job = await getJSON<AiJob>(store, aiJobKey(id));
  if (!job) {
    return withCors(errorResponse(404, 'not_found', 'Job not found'), request, env);
  }

  if (request.method === 'GET') {
    const stale = staleWorkingJobError(job);
    if (stale) {
      await setJSON(store, aiJobKey(stale.id), stale);
      await writeJobInbox(store, stale);
      return withCors(okResponse(200, stale), request, env);
    }
    return withCors(okResponse(200, job), request, env);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  const parsed = AiJobPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Invalid job resolution', parsed.error.flatten()),
      request,
      env
    );
  }

  const applied = applyJobResolution(job, parsed.data.resolution);
  if (!applied.ok) {
    return withCors(errorResponse(400, 'validation_error', applied.message), request, env);
  }

  await setJSON(store, aiJobKey(applied.job.id), applied.job);
  await writeJobInbox(store, applied.job);
  return withCors(okResponse(200, applied.job), request, env);
}

export const config = { path: '/api/ai/jobs/:id' };
