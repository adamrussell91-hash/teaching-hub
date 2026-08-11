const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 4;

export class AnthropicStreamError extends Error {
  constructor(
    public code: string,
    public retryable: boolean
  ) {
    super('Anthropic request failed.');
    this.name = 'AnthropicStreamError';
  }
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'usage'; input_tokens?: number; output_tokens?: number }
  | { type: 'done' };

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export function createAnthropicStreamer(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return {
    async *streamMessage(options: {
      system: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }>;
      tools: ToolDef[];
      model?: string;
      signal?: AbortSignal;
      executeTools?: (event: { id: string; name: string; input: unknown }) => Promise<string | null>;
    }): AsyncGenerator<StreamEvent> {
      let roundMessages = options.messages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const pending: Array<{ toolCall: { id: string; name: string; input: unknown }; result: string }> =
          [];
        const assistantBlocks: unknown[] = [];
        let sawDone = false;
        let usage: { input_tokens?: number; output_tokens?: number } | null = null;

        for await (const event of streamOnce({
          apiKey,
          fetchImpl,
          system: options.system,
          messages: roundMessages,
          tools: options.tools,
          model: options.model ?? DEFAULT_MODEL,
          signal: options.signal,
          assistantBlocks
        })) {
          if (event.type === 'usage') {
            usage = event;
            continue;
          }
          if (event.type === 'done') {
            sawDone = true;
            continue;
          }
          if (event.type === 'tool_call' && options.executeTools) {
            const result = await options.executeTools(event);
            if (result != null) {
              pending.push({ toolCall: event, result });
              continue;
            }
          }
          yield event;
        }

        if (usage) yield { type: 'usage', ...usage };

        if (pending.length > 0) {
          roundMessages = [
            ...roundMessages,
            { role: 'assistant', content: assistantBlocks },
            {
              role: 'user',
              content: pending.map(({ toolCall, result }) => ({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: result
              }))
            }
          ];
          continue;
        }

        if (sawDone) yield { type: 'done' };
        return;
      }

      yield { type: 'done' };
    }
  };
}

async function* streamOnce(args: {
  apiKey: string;
  fetchImpl: typeof fetch;
  system: string;
  messages: unknown[];
  tools: ToolDef[];
  model: string;
  signal?: AbortSignal;
  assistantBlocks: unknown[];
}): AsyncGenerator<StreamEvent> {
  let response: Response;
  try {
    response = await args.fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: MAX_TOKENS,
        system: args.system,
        messages: args.messages,
        tools: args.tools,
        stream: true
      }),
      signal: args.signal
    });
  } catch {
    throw new AnthropicStreamError('anthropic_unavailable', true);
  }

  if (!response.ok || !response.body) {
    throw new AnthropicStreamError('anthropic_http_error', response.status >= 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolBuffers = new Map<number, { id: string; name: string; json: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = event.type;
      if (type === 'content_block_start') {
        const block = event.content_block as { type?: string; id?: string; name?: string } | undefined;
        const index = typeof event.index === 'number' ? event.index : -1;
        if (block?.type === 'tool_use' && block.id && block.name && index >= 0) {
          toolBuffers.set(index, { id: block.id, name: block.name, json: '' });
          args.assistantBlocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: {}
          });
        } else if (block?.type === 'text') {
          args.assistantBlocks.push({ type: 'text', text: '' });
        }
      } else if (type === 'content_block_delta') {
        const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        const index = typeof event.index === 'number' ? event.index : -1;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          yield { type: 'text', text: delta.text };
          const block = args.assistantBlocks[index] as { type?: string; text?: string } | undefined;
          if (block?.type === 'text') block.text = (block.text ?? '') + delta.text;
        } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const buf = toolBuffers.get(index);
          if (buf) buf.json += delta.partial_json;
        }
      } else if (type === 'content_block_stop') {
        const index = typeof event.index === 'number' ? event.index : -1;
        const buf = toolBuffers.get(index);
        if (buf) {
          let input: unknown = {};
          try {
            input = buf.json ? JSON.parse(buf.json) : {};
          } catch {
            input = {};
          }
          const block = args.assistantBlocks[index] as { input?: unknown } | undefined;
          if (block) block.input = input;
          yield { type: 'tool_call', id: buf.id, name: buf.name, input };
          toolBuffers.delete(index);
        }
      } else if (type === 'message_delta') {
        const usage = event.usage as { output_tokens?: number } | undefined;
        if (usage) yield { type: 'usage', output_tokens: usage.output_tokens };
      } else if (type === 'message_start') {
        const message = event.message as { usage?: { input_tokens?: number } } | undefined;
        if (message?.usage) yield { type: 'usage', input_tokens: message.usage.input_tokens };
      } else if (type === 'message_stop') {
        yield { type: 'done' };
      }
    }
  }
}
