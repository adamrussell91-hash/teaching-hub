import type { Lesson } from '../../src/schemas/lesson.ts';
import {
  AiJobCreateSchema,
  appendTranscriptTurns,
  fixtureReplaceLessonProposal,
  proposalFromKernelPayload,
  type AiJob,
  type AiTranscriptTurn
} from '../../src/ai/jobs.ts';
import { newId } from './_shared/create-helpers.mts';
import {
  aiJobKey,
  aiTranscriptKey,
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

const DEFAULT_KERNEL_URL = 'https://knowledge-hub-research.adamrussell91.workers.dev';

async function loadTranscript(
  store: ReturnType<typeof getContentStore>,
  lessonId: string,
  agent: string
): Promise<AiTranscriptTurn[]> {
  const existing = await getJSON<AiTranscriptTurn[]>(store, aiTranscriptKey(lessonId, agent));
  return Array.isArray(existing) ? existing : [];
}

async function persistCompletedJob(
  store: ReturnType<typeof getContentStore>,
  job: AiJob,
  proposal: AiJob['proposal']
): Promise<AiJob> {
  const completed: AiJob = { ...job, status: 'done', proposal };
  await setJSON(store, aiJobKey(job.id), completed);
  const existing = await loadTranscript(store, job.lesson_id, job.agent);
  await setJSON(
    store,
    aiTranscriptKey(job.lesson_id, job.agent),
    appendTranscriptTurns(existing, [
      { role: 'user', content: job.message },
      { role: 'assistant', content: 'Proposed a replace_lesson draft.' }
    ])
  );
  return completed;
}

async function tryKernelProposal(input: {
  url?: string;
  secret?: string;
  query: string;
  lesson: Lesson;
  transcript: AiTranscriptTurn[];
}): Promise<{ proposal?: ReturnType<typeof fixtureReplaceLessonProposal>; missing: boolean }> {
  const secret = input.secret;
  if (!secret) return { missing: true };
  const base = (input.url || DEFAULT_KERNEL_URL).replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/lesson_proposal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TeachingHub/1.0',
        'x-research-kernel-secret': secret
      },
      body: JSON.stringify({
        query: input.query,
        lesson: input.lesson,
        transcript: input.transcript
      })
    });
    if (response.status === 404) return { missing: true };
    if (!response.ok) return { missing: true };
    const payload: unknown = await response.json();
    const proposal = proposalFromKernelPayload(payload);
    if (!proposal) return { missing: true };
    return { proposal, missing: false };
  } catch {
    return { missing: true };
  }
}

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
  const store = getContentStore();
  const lesson = await getJSON<Lesson>(store, draftLessonKey(body.lesson_id));
  if (!lesson) {
    return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
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

  // Minutes-scale Clementine runs belong on the research kernel job.
  // When RESEARCH_KERNEL_URL/secret is unset or /lesson_proposal is missing,
  // store a schema-valid replace_lesson fixture so local/dev/tests never call Anthropic.
  const transcript = await loadTranscript(store, body.lesson_id, body.agent);
  const kernel = await tryKernelProposal({
    url: env.RESEARCH_KERNEL_URL,
    secret: env.RESEARCH_KERNEL_SHARED_SECRET,
    query: body.message,
    lesson,
    transcript
  });
  const proposal = kernel.proposal ?? fixtureReplaceLessonProposal();
  await persistCompletedJob(store, job, proposal);

  return withCors(okResponse(202, { id, status: 'working' }), request, env);
}

export const config = { path: '/api/ai/jobs' };
