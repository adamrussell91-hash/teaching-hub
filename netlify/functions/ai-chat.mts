import { agentBySlug } from '../../src/ai/agents.ts';
import { resolveSelection } from '../../src/ai/selection.ts';
import { pullArchive } from '../../src/ai/archiveKernel.ts';
import { matchCompositionFill } from '../../src/ai/composition-fill.ts';
import { buildAiSystemPrompt } from '../../src/ai/context.ts';
import { protocolForAgent } from '../../src/ai/protocols.ts';
import { AI_TOOLS, AiChatRequestSchema, parseToolProposal } from '../../src/ai/proposals.ts';
import { validateProposalAgainstSearchPack } from '../../src/ai/search-pack-validation.ts';
import type { Lesson } from '../../src/schemas/lesson.ts';
import { CompositionTemplateSchema, type CompositionTemplate } from '../../src/schemas/composition.ts';
import { searchPublicWeb, buildLessonSearchQuery } from './_shared/brave-search.mts';
import {
  createAnthropicStreamer,
  AnthropicStreamError,
  DEFAULT_MODEL
} from './_shared/anthropic-stream.mts';
import {
  aiUsageLogKey,
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

function sseEncode(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  // Safe readiness probe: never returns the key, only whether chat can talk to Anthropic.
  if (request.method === 'GET') {
    const originGuard = guardRequestOrigin(request, env);
    if (originGuard) return withCors(originGuard, request, env);
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);
    const session = getTeacherSession(request, env);
    if (!session.authenticated) {
      return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
    }
    const key = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY.trim() : '';
    return withCors(
      okResponse(200, {
        anthropic_configured: key.length > 0,
        model: DEFAULT_MODEL
      }),
      request,
      env
    );
  }

  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
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

  const parsed = AiChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      errorResponse(400, 'validation_error', 'Invalid AI chat request', parsed.error.flatten()),
      request,
      env
    );
  }

  const body = parsed.data;
  const agent = agentBySlug(body.agent);
  if (!agent) {
    return withCors(errorResponse(400, 'validation_error', 'Unknown agent'), request, env);
  }

  const store = getContentStore();
  const lesson = await getJSON<Lesson>(store, draftLessonKey(body.lesson_id));
  if (!lesson) {
    return withCors(errorResponse(404, 'not_found', 'Lesson not found'), request, env);
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return withCors(
      errorResponse(503, 'misconfigured', 'AI provider is not configured'),
      request,
      env
    );
  }

  const searchPack = await searchPublicWeb({
    query: buildLessonSearchQuery(body.message, lesson.title),
    apiKey: env.BRAVE_SEARCH_API_KEY
  });
  const selection = resolveSelection(lesson.blocks, body.selected_block_id, body.scope);

  let protocol = protocolForAgent(body.agent);
  let archiveFindings: Array<{ pageId: string; title: string; excerpt: string; stance: string }> = [];
  let archiveFailed = false;
  const kernelSecret = env.RESEARCH_KERNEL_SHARED_SECRET;
  if (body.agent === 'clementine' && kernelSecret) {
    const archive = await pullArchive({
      query: body.message,
      documentContext: `${lesson.title}\n${body.message}`,
      url: env.RESEARCH_KERNEL_URL,
      secret: kernelSecret
    });
    archiveFailed = Boolean(archive.archiveFailed);
    archiveFindings = archive.findings;
    protocol = `${protocol}\n\n${archive.note}`;
  }

  const { blobs: compositionBlobs } = await store.list({ prefix: 'templates/compositions/' });
  const library = (
    await Promise.all(compositionBlobs.map((blob) => getJSON<CompositionTemplate>(store, blob.key)))
  ).flatMap((entry) => {
    const parsed = CompositionTemplateSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const compositionFill = matchCompositionFill({
    action: body.action,
    message: body.message,
    library
  });

  const system = buildAiSystemPrompt({
    agentName: agent.name,
    protocol,
    lesson,
    scope: selection.scope,
    selectedBlockId: selection.selectedBlockId,
    action: body.action,
    fullLesson: body.agent === 'clementine',
    compositionFill: compositionFill ?? undefined,
    searchPack
  });

  const history = (body.history ?? []).map((m) => ({
    role: m.role,
    content: m.content
  }));

  const streamer = createAnthropicStreamer(apiKey);
  const encoder = new TextEncoder();
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(payload)));
      };

      try {
        send({ type: 'status', text: 'Thinking…' });
        if (body.agent === 'clementine' && (archiveFindings.length || archiveFailed)) {
          send({
            type: 'research',
            findings: archiveFindings,
            archiveFailed
          });
        }
        for await (const event of streamer.streamMessage({
          system,
          messages: [...history, { role: 'user', content: body.message }],
          tools: [...AI_TOOLS],
          signal: request.signal,
          executeTools: async (toolEvent) => {
            const proposal = parseToolProposal(toolEvent.name, toolEvent.input);
            if ('error' in proposal) {
              send({ type: 'tool_error', name: toolEvent.name, error: proposal.error });
              return JSON.stringify({ ok: false, error: proposal.error });
            }
            const validation = validateProposalAgainstSearchPack(proposal, searchPack);
            if (!validation.ok) {
              const references = validation.violations
                .map(({ path, value }) => `${path}=${value}`)
                .join(', ');
              const error = `Media not in search pack: ${references}`;
              send({ type: 'tool_error', name: toolEvent.name, error });
              return JSON.stringify({ ok: false, error });
            }
            send({ type: 'proposal', proposal });
            return JSON.stringify({ ok: true, status: 'awaiting_teacher_accept' });
          }
        })) {
          if (event.type === 'text') send({ type: 'text', text: event.text });
          if (event.type === 'usage') {
            if (typeof event.input_tokens === 'number') inputTokens += event.input_tokens;
            if (typeof event.output_tokens === 'number') outputTokens += event.output_tokens;
          }
          if (event.type === 'done') send({ type: 'done' });
        }
      } catch (err) {
        const retryable = err instanceof AnthropicStreamError ? err.retryable : true;
        const message =
          err instanceof AnthropicStreamError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'AI request failed';
        send({
          type: 'error',
          code: err instanceof AnthropicStreamError ? err.code : 'ai_failed',
          message,
          retryable
        });
      } finally {
        try {
          const day = new Date().toISOString().slice(0, 10);
          const key = aiUsageLogKey(day);
          const existing = (await getJSON<{ entries?: unknown[] }>(store, key)) ?? { entries: [] };
          const entries = Array.isArray(existing.entries) ? existing.entries : [];
          entries.push({
            at: new Date().toISOString(),
            agent: body.agent,
            scope: body.scope,
            lesson_id: body.lesson_id,
            action: body.action ?? null,
            input_tokens: inputTokens || null,
            output_tokens: outputTokens || null
          });
          await setJSON(store, key, { entries });
        } catch {
          /* usage log best-effort */
        }
        controller.close();
      }
    }
  });

  return withCors(
    new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive'
      }
    }),
    request,
    env
  );
}

export const config = { path: '/api/ai/chat' };
