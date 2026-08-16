import { pullArchive, type ArchivePull } from '../../../src/ai/archiveKernel.ts';
import {
  appendTranscriptTurns,
  applyKernelOutcome,
  buildKernelJobPayload,
  classifyKernelResponse,
  staleWorkingJobError,
  type AiJob,
  type AiTranscriptTurn,
  type KernelJobPayload,
  type KernelOutcome
} from '../../../src/ai/jobs.ts';
import type { Lesson } from '../../../src/schemas/lesson.ts';
import { syncInboxForJob, type AiJobInbox } from '../../../src/ai/jobs-inbox.ts';
import { emptySearchPack } from '../../../src/ai/search-pack.ts';
import {
  aiJobKey,
  aiJobsInboxKey,
  aiTranscriptKey,
  draftLessonKey,
  getJSON,
  setJSON
} from './blobs.mts';
import type { Store } from '@netlify/blobs';

const DEFAULT_KERNEL_URL = 'https://knowledge-hub-research.adamrussell91.workers.dev';

async function loadTranscript(
  store: Store,
  lessonId: string,
  agent: string
): Promise<AiTranscriptTurn[]> {
  const existing = await getJSON<AiTranscriptTurn[]>(store, aiTranscriptKey(lessonId, agent));
  return Array.isArray(existing) ? existing : [];
}

export async function writeJobInbox(store: Store, job: AiJob): Promise<void> {
  const lesson = await getJSON<Lesson>(store, draftLessonKey(job.lesson_id));
  const inbox = (await getJSON<AiJobInbox>(store, aiJobsInboxKey())) ?? { jobs: [] };
  await setJSON(store, aiJobsInboxKey(), syncInboxForJob(inbox, job, lesson?.title ?? 'Lesson'));
}

async function persistJobResult(store: Store, job: AiJob): Promise<AiJob> {
  await setJSON(store, aiJobKey(job.id), job);
  await writeJobInbox(store, job);
  if (job.status !== 'done' && job.status !== 'error') return job;
  const existing = await loadTranscript(store, job.lesson_id, job.agent);
  const assistant =
    job.status === 'error'
      ? `Job failed: ${job.error ?? 'unknown error'}`
      : 'Proposed a replace_lesson draft.';
  await setJSON(
    store,
    aiTranscriptKey(job.lesson_id, job.agent),
    appendTranscriptTurns(existing, [
      { role: 'user', content: job.message },
      { role: 'assistant', content: assistant }
    ])
  );
  return job;
}

async function tryKernelProposal(input: {
  url?: string;
  secret?: string;
  body: KernelJobPayload;
}): Promise<KernelOutcome> {
  const secret = input.secret;
  const searchPack = input.body.searchPack;
  if (!secret) return classifyKernelResponse({ secret, searchPack });
  const base = (input.url || DEFAULT_KERNEL_URL).replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/lesson_proposal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TeachingHub/1.0',
        'x-research-kernel-secret': secret
      },
      body: JSON.stringify(input.body)
    });
    let payload: unknown;
    let invalidJson = false;
    try {
      payload = await response.json();
    } catch {
      invalidJson = true;
    }
    return classifyKernelResponse({
      secret,
      status: response.status,
      payload,
      invalidJson,
      searchPack
    });
  } catch {
    return classifyKernelResponse({ secret, networkError: true, searchPack });
  }
}

export async function completeWorkingAiJob(
  store: Store,
  job: AiJob,
  env: NodeJS.ProcessEnv
): Promise<AiJob> {
  if (job.status !== 'working') return job;

  const stale = staleWorkingJobError(job);
  if (stale) return persistJobResult(store, stale);

  const lesson = await getJSON<Lesson>(store, draftLessonKey(job.lesson_id));
  if (!lesson) {
    return persistJobResult(
      store,
      applyKernelOutcome(job, { kind: 'failed', error: 'Lesson not found' })
    );
  }

  const transcript = await loadTranscript(store, job.lesson_id, job.agent);
  const kernelSecret = env.RESEARCH_KERNEL_SHARED_SECRET;
  let archive: ArchivePull | undefined;
  if (kernelSecret) {
    archive = await pullArchive({
      query: job.message,
      documentContext: `${lesson.title}\n${job.message}`,
      url: env.RESEARCH_KERNEL_URL,
      secret: kernelSecret
    });
  }
  const nextJob = archive?.archiveFailed ? { ...job, archiveFailed: true } : job;

  const outcome = await tryKernelProposal({
    url: env.RESEARCH_KERNEL_URL,
    secret: kernelSecret,
    body: buildKernelJobPayload({
      query: job.message,
      lesson,
      transcript,
      archive,
      searchPack: emptySearchPack(job.message)
    })
  });
  return persistJobResult(store, applyKernelOutcome(nextJob, outcome));
}
