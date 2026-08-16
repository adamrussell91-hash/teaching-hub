import type { HtmlAppAiLane, HtmlAppAiMessage } from '../../../src/blocks/html-app-ai.ts';
import { resolveAnthropicModel } from '../../../src/ai/models.ts';
import { messageForAnthropicHttpError } from './anthropic-stream.mts';

export class ProviderConfigError extends Error {
  constructor(public provider: string) {
    super(`Missing API key for ${provider}`);
    this.name = 'ProviderConfigError';
  }
}

export class ProviderUpstreamError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message = `Upstream ${provider} failed (${status})`
  ) {
    super(message);
    this.name = 'ProviderUpstreamError';
  }
}

function openAiErrorDetails(bodyText: string): { type: string; message: string } {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { type?: string; code?: string; message?: string };
    };
    return {
      type: parsed.error?.type ?? parsed.error?.code ?? '',
      message: parsed.error?.message ?? ''
    };
  } catch {
    return { type: '', message: '' };
  }
}

export function messageForProviderHttpError(
  provider: HtmlAppAiLane['provider'],
  status: number,
  bodyText: string
): string {
  if (provider === 'anthropic') return messageForAnthropicHttpError(status, bodyText);

  const { type, message } = openAiErrorDetails(bodyText);
  if (status === 401 || status === 403 || /auth|api.?key/i.test(type)) {
    return 'OpenAI rejected the API key. Check OPENAI_API_KEY on the Netlify Functions site.';
  }
  if (status === 404 || /model/i.test(type) || /model/i.test(message)) {
    return message
      ? `OpenAI rejected the model request: ${message}`
      : 'OpenAI rejected the model request. The configured model may be unavailable.';
  }
  if (status === 429 || /rate.?limit/i.test(type)) {
    return 'OpenAI rate limit hit. Wait a moment and try again.';
  }
  if (status >= 500) return `OpenAI is temporarily unavailable (HTTP ${status}).`;
  return `OpenAI request failed (HTTP ${status}).`;
}

export async function completeWithProvider(
  lane: HtmlAppAiLane,
  messages: HtmlAppAiMessage[],
  env: NodeJS.ProcessEnv
): Promise<string> {
  if (lane.provider === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new ProviderConfigError('openai');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: lane.model,
        max_tokens: lane.max_tokens,
        messages: [{ role: 'system', content: lane.system }, ...messages]
      })
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new ProviderUpstreamError(
        'openai',
        res.status,
        messageForProviderHttpError('openai', res.status, bodyText)
      );
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new ProviderUpstreamError('openai', res.status);
    return text;
  }

  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderConfigError('anthropic');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: resolveAnthropicModel(lane.model),
      max_tokens: lane.max_tokens,
      system: lane.system,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new ProviderUpstreamError(
      'anthropic',
      res.status,
      messageForProviderHttpError('anthropic', res.status, bodyText)
    );
  }
  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content?.find((c) => c.type === 'text')?.text;
  if (typeof text !== 'string') throw new ProviderUpstreamError('anthropic', res.status);
  return text;
}
