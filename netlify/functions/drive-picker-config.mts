import { pickerConfigFromValues } from '../../src/teacher/google-picker-config';
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

function configFromEnv(env: NodeJS.ProcessEnv) {
  return pickerConfigFromValues({
    clientId: env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID,
    apiKey: env.GOOGLE_PICKER_API_KEY || env.VITE_GOOGLE_PICKER_API_KEY,
    appId: env.GOOGLE_APP_ID || env.VITE_GOOGLE_APP_ID
  });
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getTeacherSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthorized', 'Authentication required'), request, env);
  }

  const config = configFromEnv(env);
  if (!config) {
    return withCors(
      errorResponse(
        404,
        'not_configured',
        'Google Drive is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_PICKER_API_KEY)'
      ),
      request,
      env
    );
  }

  return withCors(okResponse(200, config), request, env);
}

export const config = { path: '/api/drive-picker-config' };
