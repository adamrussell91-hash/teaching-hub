import { SESSION_COOKIE_NAME, verifySessionToken } from './auth-security.mts';
import { readCookie } from './http.mts';

export interface TeacherSessionState {
  authenticated: boolean;
  expiresAt?: number;
}

/**
 * Reads and verifies the teacher session cookie for a request.
 *
 * Callers must confirm `isConfigured(env)` first — `verifySessionToken`
 * throws if `SESSION_SECRET` is missing or too short, and we'd rather fail
 * with a clear 503 than let that exception bubble out of a route handler.
 */
export function getTeacherSession(request: Request, env: NodeJS.ProcessEnv): TeacherSessionState {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  const verification = verifySessionToken(token, env.SESSION_SECRET);
  return verification.valid ? { authenticated: true, expiresAt: verification.payload.exp } : { authenticated: false };
}
