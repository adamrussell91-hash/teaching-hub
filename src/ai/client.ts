import { getApiBaseUrl } from '@/api/config';
import type { AiProposal } from '@/ai/proposals';
import type { AgentSlug } from '@/ai/agents';
import type { AiScope } from '@/ai/proposals';

export type ArchiveCitation = {
  pageId: string;
  title: string;
  excerpt: string;
  stance: string;
};

export type AiStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | { type: 'proposal'; proposal: AiProposal }
  | { type: 'research'; findings: ArchiveCitation[]; archiveFailed?: boolean }
  | { type: 'tool_error'; name: string; error: string }
  | { type: 'error'; code: string; message: string; retryable?: boolean }
  | { type: 'done' };

export interface AiChatPayload {
  lesson_id: string;
  agent: AgentSlug;
  scope: AiScope;
  selected_block_id: string;
  message: string;
  action?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function streamAiChat(
  payload: AiChatPayload,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok || !response.body) {
    let message = `AI request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    onEvent({ type: 'error', code: 'http_error', message, retryable: response.status >= 500 });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as AiStreamEvent;
        onEvent(event);
      } catch {
        /* ignore malformed */
      }
    }
  }
}
