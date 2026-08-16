// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messageForAnthropicHttpError } from '../../netlify/functions/_shared/anthropic-stream.mts';

describe('messageForAnthropicHttpError', () => {
  it('points at Netlify env when Anthropic rejects the key', () => {
    expect(
      messageForAnthropicHttpError(
        401,
        JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } })
      )
    ).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('surfaces model rejection details', () => {
    expect(
      messageForAnthropicHttpError(
        404,
        JSON.stringify({ error: { type: 'not_found_error', message: 'model: claude-x' } })
      )
    ).toContain('claude-x');
  });

  it('marks rate limits clearly', () => {
    expect(
      messageForAnthropicHttpError(
        429,
        JSON.stringify({ error: { type: 'rate_limit_error', message: 'Overloaded' } })
      )
    ).toMatch(/rate limit/i);
  });
});
