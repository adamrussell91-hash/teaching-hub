/**
 * Production API origin (not a secret). Prefer build-time
 * `VITE_API_BASE_URL` (e.g. in CI) so you don't need a code edit after the
 * first Netlify deploy; otherwise fall back to the committed placeholder.
 *
 * Sensitive values stay on Netlify only: passphrase hash, session secret.
 * After Functions are live, set SITE_ORIGIN to the Pages origin and run
 * `npm run seed:blobs` once — see README Deploy.
 */
const PLACEHOLDER_API_BASE_URL = 'https://YOUR_NETLIFY_SITE.netlify.app';

function readViteApiBaseUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const value = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
    ?.VITE_API_BASE_URL;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

const PRODUCTION_API_BASE_URL = readViteApiBaseUrl() ?? PLACEHOLDER_API_BASE_URL;

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
