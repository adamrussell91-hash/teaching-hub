import { getContentStore, getJSON, publishedLessonKey } from './_shared/blobs.mts';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';
import { findBlockById } from '../../src/blocks/find-block.ts';
import {
  clampHtmlAppAiRequest,
  resolveHtmlAppAiLane,
  type HtmlAppAiMessage
} from '../../src/blocks/html-app-ai.ts';
import type { Block } from '../../src/schemas/block.ts';
import {
  completeWithProvider,
  ProviderConfigError,
  ProviderUpstreamError
} from './_shared/html-app-providers.mts';

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  let body: {
    lesson_id?: string;
    block_id?: string;
    messages?: HtmlAppAiMessage[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withCors(errorResponse(400, 'bad_request', 'Invalid JSON body'), request, env);
  }

  const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
  const blockId = typeof body.block_id === 'string' ? body.block_id.trim() : '';
  if (!lessonId || !blockId || !Array.isArray(body.messages)) {
    return withCors(
      errorResponse(400, 'bad_request', 'lesson_id, block_id, and messages are required'),
      request,
      env
    );
  }

  const snapshot = await getJSON(getContentStore(), publishedLessonKey(lessonId));
  if (!snapshot || typeof snapshot !== 'object') {
    return withCors(errorResponse(404, 'not_found', 'Lesson is not published'), request, env);
  }
  const lesson = snapshot as { blocks?: unknown };
  const blocks = Array.isArray(lesson.blocks) ? (lesson.blocks as Block[]) : [];
  const block = findBlockById(blocks, blockId);
  if (!block) {
    return withCors(errorResponse(404, 'not_found', 'Block not found'), request, env);
  }
  const lane = resolveHtmlAppAiLane(block);
  if (!lane || !lane.model || !lane.system.trim()) {
    return withCors(
      errorResponse(403, 'forbidden', 'AI lane is not enabled for this block'),
      request,
      env
    );
  }

  const messages = clampHtmlAppAiRequest(
    body.messages.map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m?.content === 'string' ? m.content : ''
    }))
  );

  try {
    const text = await completeWithProvider(lane, messages, env);
    return withCors(okResponse(200, { text }), request, env);
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return withCors(
        errorResponse(503, 'misconfigured', 'AI provider is not configured'),
        request,
        env
      );
    }
    if (err instanceof ProviderUpstreamError) {
      return withCors(
        errorResponse(502, 'upstream_error', err.message),
        request,
        env
      );
    }
    throw err;
  }
}

export const config = { path: '/api/html-app-ai' };
