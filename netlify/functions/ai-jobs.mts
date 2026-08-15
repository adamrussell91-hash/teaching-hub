import { AiJobCreateSchema, type AiJob } from '../../src/ai/jobs.ts';
import { unresolvedJobForLesson, type AiJobInbox } from '../../src/ai/jobs-inbox.ts';
import { writeJobInbox } from './_shared/ai-job-complete.mts';
import { newId } from './_shared/create-helpers.mts';
import {
  aiJobKey,
  aiJobsInboxKey,
  draftLessonKey,
  getContentStore,
  getJSON,
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
import type { Lesson } from '../../src/schemas/lesson.ts';

async function invokeBackgroundRun(request: Request, env: NodeJS.ProcessEnv, id: string): Promise<void> {
  const secret = env.AI_JOB_RUN_SECRET || env.RESEARCH_KERNEL_SHARED_SECRET || '';
  const url = new URL('/.netlify/functions/ai-job-run-background', request.url);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-job-run-secret': secret
      },
      body: JSON.stringify({ id })
    });
  } catch {
    /* job stays working; poll or stale-timeout will surface it */
  }
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST' && request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const store = getContentStore();

  if (request.method === 'GET') {
    const inbox = (await getJSON<AiJobInbox>(store, aiJobsInboxKey())) ?? { jobs: [] };
    return withCors(okResponse(200, inbox), request, env);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }

  const parsed = AiJobCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Invalid AI job request', parsed.error.flatten()),
      request,
      env
    );
  }

  const body = parsed.data;
  const lesson = await getJSON<Lesson>(store, draftLessonKey(body.lesson_id));
  if (!lesson) {
    return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
  }

  const inbox = (await getJSON<AiJobInbox>(store, aiJobsInboxKey())) ?? { jobs: [] };
  const existing = unresolvedJobForLesson(inbox, body.lesson_id);
  if (existing) {
    return withCors(
      errorResponse(409, 'conflict', 'An unresolved job already exists for this lesson', {
        id: existing.id,
        status: existing.status
      }),
      request,
      env
    );
  }

  const now = new Date().toISOString();
  const id = newId('ai_job');
  const job: AiJob = {
    id,
    lesson_id: body.lesson_id,
    agent: body.agent,
    status: 'working',
    snapshot_at: now,
    message: body.message,
    created_at: now
  };
  await setJSON(store, aiJobKey(id), job);
  await writeJobInbox(store, job);
  await invokeBackgroundRun(request, env, id);

  return withCors(okResponse(202, { id, status: 'working' }), request, env);
}

export const config = { path: '/api/ai/jobs' };
