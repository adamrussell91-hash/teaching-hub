import type { AiJob } from '../../src/ai/jobs.ts';
import { completeWorkingAiJob } from './_shared/ai-job-complete.mts';
import { aiJobKey, getContentStore, getJSON } from './_shared/blobs.mts';
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

function hasRunSecret(request: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env.AI_JOB_RUN_SECRET || env.RESEARCH_KERNEL_SHARED_SECRET || '';
  if (!expected) return false;
  return request.headers.get('x-ai-job-run-secret') === expected;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard && !hasRunSecret(request, env)) {
    return withCors(originGuard, request, env);
  }
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated && !hasRunSecret(request, env)) {
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

  const resolved = job.status === 'working' ? await completeWorkingAiJob(store, job, env) : job;
  return withCors(okResponse(200, resolved), request, env);
}

export const config = { path: '/api/ai/jobs/:id/run' };
