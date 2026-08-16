import type { HtmlAppAiLane, HtmlAppAiMessage } from '../../../src/blocks/html-app-ai.ts';
import { resolveAnthropicModel } from '../../../src/ai/models.ts';

export class ProviderConfigError extends Error {
  constructor(public provider: string) {
    super(`Missing API key for ${provider}`);
    this.name = 'ProviderConfigError';
  }
}

export class ProviderUpstreamError extends Error {
  constructor(
    public provider: string,
    public status: number
  ) {
    super(`Upstream ${provider} failed (${status})`);
    this.name = 'ProviderUpstreamError';
  }
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
    if (!res.ok) throw new ProviderUpstreamError('openai', res.status);
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
  if (!res.ok) throw new ProviderUpstreamError('anthropic', res.status);
  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content?.find((c) => c.type === 'text')?.text;
  if (typeof text !== 'string') throw new ProviderUpstreamError('anthropic', res.status);
  return text;
}
