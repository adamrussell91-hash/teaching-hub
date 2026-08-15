import { getApiBaseUrl } from '@/api/config';
import type { AgentSlug } from '@/ai/agents';
import type { AiJob } from '@/ai/jobs';

export type StartAiJobPayload = {
  lesson_id: string;
  agent: AgentSlug;
  message: string;
};

export type StartAiJobResult = {
  id: string;
  status: 'working';
};

async function readOkData<T>(response: Response): Promise<T> {
  const body = (await response.json()) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (body && body.ok === true && body.data !== undefined) {
    return body.data;
  }
  throw new Error(body?.error?.message ?? `AI job request failed (${response.status})`);
}

export async function startAiJob(
  payload: StartAiJobPayload,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<StartAiJobResult> {
  const baseUrl = getApiBaseUrl(options?.baseUrl);
  const response = await fetch(`${baseUrl}/api/ai/jobs`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal
  });
  return readOkData<StartAiJobResult>(response);
}

export async function pollAiJob(
  id: string,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<AiJob> {
  const baseUrl = getApiBaseUrl(options?.baseUrl);
  const response = await fetch(`${baseUrl}/api/ai/jobs/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal: options?.signal
  });
  return readOkData<AiJob>(response);
}
