import type { AiJob } from '../../src/ai/jobs.ts';
import { completeWorkingAiJob } from './_shared/ai-job-complete.mts';
import { aiJobKey, getContentStore, getJSON } from './_shared/blobs.mts';
import { errorResponse, jsonResponse, okResponse } from './_shared/http.mts';

function hasRunSecret(request: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.AI_JOB_RUN_SECRET || env.RESEARCH_KERNEL_SHARED_SECRET || '';
  if (!expected) return true;
  return request.headers.get('x-ai-job-run-secret') === expected;
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: { code: 'method_not_allowed', message: 'POST only' } });
  }
  if (!hasRunSecret(request, env)) {
    return errorResponse(401, 'unauthorized', 'Authentication required');
  }

  let id = '';
  try {
    const raw = (await request.json()) as { id?: unknown };
    if (typeof raw.id === 'string') id = raw.id;
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body is not valid JSON');
  }
  if (!id) return errorResponse(400, 'validation_error', 'Job id is required');

  const store = getContentStore();
  const job = await getJSON<AiJob>(store, aiJobKey(id));
  if (!job) return errorResponse(404, 'not_found', 'Job not found');

  const resolved = job.status === 'working' ? await completeWorkingAiJob(store, job, env) : job;
  return okResponse(200, resolved);
}
