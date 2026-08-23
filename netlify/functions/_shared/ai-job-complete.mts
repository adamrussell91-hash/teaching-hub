import { pullArchive, type ArchivePull } from '../../../src/ai/archiveKernel.ts';
import { agentBySlug } from '../../../src/ai/agents.ts';
import { matchCompositionFill } from '../../../src/ai/composition-fill.ts';
import { buildAiSystemPrompt } from '../../../src/ai/context.ts';
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
import { protocolForAgent } from '../../../src/ai/protocols.ts';
import { protocolSteerBlock } from '../../../src/ai/agent-protocols.ts';
import { AI_TOOLS, parseToolProposal, type AiProposal } from '../../../src/ai/proposals.ts';
import { resolveSelection } from '../../../src/ai/selection.ts';
import { validateMutatingProposal } from '../../../src/ai/validate-proposal.ts';
import {
  CompositionTemplateSchema,
  type CompositionTemplate
} from '../../../src/schemas/composition.ts';
import type { Lesson } from '../../../src/schemas/lesson.ts';
import { syncInboxForJob, type AiJobInbox } from '../../../src/ai/jobs-inbox.ts';
import { buildLessonSearchQuery, searchPublicWeb } from './brave-search.mts';
import {
  aiJobKey,
  aiJobsInboxKey,
  aiTranscriptKey,
  draftLessonKey,
  getJSON,
  setJSON
} from './blobs.mts';
import { AnthropicStreamError, createAnthropicStreamer } from './anthropic-stream.mts';
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
      : job.proposal
        ? job.response || `Proposed a ${job.proposal.kind} change.`
        : job.response || 'Completed without a proposal.';
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

async function persistWorkingPhase(
  store: Store,
  job: AiJob,
  phase: NonNullable<AiJob['phase']>
): Promise<AiJob> {
  const next = { ...job, phase };
  await setJSON(store, aiJobKey(next.id), next);
  await writeJobInbox(store, next);
  return next;
}

async function loadCompositionLibrary(store: Store): Promise<CompositionTemplate[]> {
  const { blobs } = await store.list({ prefix: 'templates/compositions/' });
  return (
    await Promise.all(blobs.map((blob) => getJSON<CompositionTemplate>(store, blob.key)))
  ).flatMap((entry) => {
    const parsed = CompositionTemplateSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

async function completeFastAgentJob(
  store: Store,
  job: AiJob,
  lesson: Lesson,
  env: NodeJS.ProcessEnv
): Promise<AiJob> {
  const agent = agentBySlug(job.agent);
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!agent || !apiKey) {
    return persistJobResult(store, {
      ...job,
      status: 'error',
      error: !agent ? 'Unknown agent' : 'AI provider is not configured'
    });
  }

  let working = await persistWorkingPhase(store, job, 'searching');
  const [searchPack, library] = await Promise.all([
    searchPublicWeb({
      query: buildLessonSearchQuery(job.message, lesson.title),
      apiKey: env.BRAVE_SEARCH_API_KEY
    }),
    loadCompositionLibrary(store)
  ]);
  const selection = resolveSelection(lesson.blocks, job.selected_block_id, job.scope ?? 'lesson');
  const compositionFill = matchCompositionFill({
    action: job.action,
    message: job.message,
    library
  });
  const system = buildAiSystemPrompt({
    agentName: agent.name,
    protocol: protocolForAgent(job.agent, job.protocol_id),
    lesson,
    scope: selection.scope,
    selectedBlockId: selection.selectedBlockId,
    action: job.action,
    fullLesson: false,
    compositionFill: compositionFill ?? undefined,
    searchPack
  });

  working = await persistWorkingPhase(store, working, 'writing');
  const streamer = createAnthropicStreamer(apiKey);
  let response = '';
  let proposal: AiProposal | undefined;
  let retriedInvalidTool = false;

  try {
    for await (const event of streamer.streamMessage({
      system,
      messages: [
        ...(job.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
        { role: 'user' as const, content: job.message }
      ],
      tools: [...AI_TOOLS],
      executeTools: async (toolEvent) => {
        const parsed = parseToolProposal(toolEvent.name, toolEvent.input);
        if ('error' in parsed) {
          retriedInvalidTool = true;
          return JSON.stringify({ ok: false, error: parsed.error });
        }
        const validation = validateMutatingProposal(parsed, searchPack);
        if (!validation.ok) {
          retriedInvalidTool = true;
          return JSON.stringify({ ok: false, error: validation.error });
        }
        proposal = parsed;
        // A valid proposal is the terminal product for a background job. Returning
        // null yields the tool call to this loop without starting another model round.
        return null;
      }
    })) {
      if (event.type === 'text') response += event.text;
      if (event.type === 'tool_call' && proposal) break;
    }
  } catch (error) {
    const message =
      error instanceof AnthropicStreamError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'AI request failed';
    return persistJobResult(store, {
      ...working,
      status: 'error',
      error: message,
      response: response.trim() || undefined,
      phase: undefined
    });
  }

  if (!proposal && !response.trim()) {
    return persistJobResult(store, {
      ...working,
      status: 'error',
      error: 'AI completed without a reply or proposal',
      phase: undefined
    });
  }
  return persistJobResult(store, {
    ...working,
    status: 'done',
    proposal,
    // Tool-schema retries cause Anthropic to narrate the fix ("Oops — response_space
    // only accepts…"). That is not teacher-facing copy once a valid proposal exists.
    response: retriedInvalidTool && proposal ? undefined : response.trim() || undefined,
    phase: undefined
  });
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

  if (job.agent !== 'clementine') {
    return completeFastAgentJob(store, job, lesson, env);
  }

  const transcript = await loadTranscript(store, job.lesson_id, job.agent);
  const kernelSecret = env.RESEARCH_KERNEL_SHARED_SECRET;
  const [archive, searchPack] = await Promise.all([
    kernelSecret
      ? pullArchive({
          query: job.message,
          documentContext: `${lesson.title}\n${job.message}`,
          url: env.RESEARCH_KERNEL_URL,
          secret: kernelSecret
        })
      : Promise.resolve<ArchivePull | undefined>(undefined),
    searchPublicWeb({
      query: buildLessonSearchQuery(job.message, lesson.title),
      apiKey: env.BRAVE_SEARCH_API_KEY
    })
  ]);
  const nextJob = archive?.archiveFailed ? { ...job, archiveFailed: true } : job;
  const protocolSteer = protocolSteerBlock(job.agent, job.protocol_id);

  const outcome = await tryKernelProposal({
    url: env.RESEARCH_KERNEL_URL,
    secret: kernelSecret,
    body: buildKernelJobPayload({
      query: protocolSteer
        ? `${protocolSteer}\n\nTeacher request: ${job.message}`
        : job.message,
      lesson,
      transcript,
      archive,
      searchPack
    })
  });
  return persistJobResult(store, applyKernelOutcome(nextJob, outcome));
}
