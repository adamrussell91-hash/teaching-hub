import { parseAlchemyResult } from '../../src/alchemy/connections.ts';
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

const ARCHIVE_UNREACHABLE = "Alchemy Lab couldn't reach the archive.";

function alchemyConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.KNOWLEDGE_ALCHEMIST_URL?.trim() && env.ALCHEMIST_SHARED_SECRET?.trim());
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;
  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  if (!alchemyConfigured(env)) {
    return withCors(
      errorResponse(503, 'misconfigured', 'Alchemy Lab is not configured.'),
      request,
      env
    );
  }

  let lessonText = '';
  try {
    const body = (await request.json()) as { lessonText?: unknown };
    lessonText = typeof body.lessonText === 'string' ? body.lessonText : '';
  } catch {
    return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
  }
  if (!lessonText.trim()) {
    return withCors(errorResponse(400, 'bad_request', 'Lesson text is required.'), request, env);
  }

  try {
    const response = await fetch(env.KNOWLEDGE_ALCHEMIST_URL!.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alchemist-secret': env.ALCHEMIST_SHARED_SECRET!.trim()
      },
      body: JSON.stringify({ lessonText })
    });
    if (!response.ok) {
      return withCors(
        errorResponse(502, 'upstream_error', ARCHIVE_UNREACHABLE),
        request,
        env
      );
    }
    const payload: unknown = await response.json();
    return withCors(okResponse(200, parseAlchemyResult(payload)), request, env);
  } catch {
    return withCors(errorResponse(502, 'upstream_error', ARCHIVE_UNREACHABLE), request, env);
  }
}

export const config = { path: '/api/alchemy-lab', timeout: 60 };
