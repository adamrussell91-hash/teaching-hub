import { GithubBackupError } from '../../src/export/github-backup.ts';
import { pushStoreArchiveToGithub } from './_shared/github-archive-backup.mts';
import { getContentStore } from './_shared/blobs.mts';
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

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  try {
    const outcome = await pushStoreArchiveToGithub({
      store: getContentStore(),
      env
    });
    if (outcome.skipped) {
      return withCors(
        errorResponse(503, 'backup_unconfigured', 'GitHub backup is not configured'),
        request,
        env
      );
    }
    return withCors(okResponse(200, outcome.result), request, env);
  } catch (err) {
    if (err instanceof GithubBackupError) {
      return withCors(errorResponse(err.status, 'backup_failed', err.message), request, env);
    }
    return withCors(errorResponse(502, 'backup_failed', 'Unable to commit the GitHub backup'), request, env);
  }
}

export const config = { path: '/api/backup/github' };
