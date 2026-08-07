/**
 * Production API origin is committed in-repo (same pattern as Life Hub).
 * It is not a secret — only Netlify env vars (passphrase hash, session secret) are sensitive.
 */
const PRODUCTION_API_BASE_URL = 'https://YOUR_NETLIFY_SITE.netlify.app';

const LOCAL_HOSTNAME_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function isVitestEnvironment(): boolean {
  return (
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: { VITEST?: boolean } }).env?.VITEST === true) ||
    (typeof process !== 'undefined' && process.env.VITEST === 'true')
  );
}

function resolveDefaultBaseUrl(): string {
  if (typeof location === 'undefined') {
    return isVitestEnvironment() ? '' : '';
  }
  return LOCAL_HOSTNAME_RE.test(location.hostname) ? '' : PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveDefaultBaseUrl();

/** Optional override for tests or custom deployments. */
export function getApiBaseUrl(override?: string): string {
  if (override !== undefined) return override;
  return API_BASE_URL;
}
