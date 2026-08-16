import {
  emptySearchPack,
  normalizeBraveSearchResults,
  type SearchPack
} from '../../../src/ai/search-pack.ts';

const BRAVE_ORIGIN = 'https://api.search.brave.com/res/v1';
const DEFAULT_TIMEOUT_MS = 4500;
const WEB_RESULT_COUNT = 8;
const MEDIA_RESULT_COUNT = 6;

export interface SearchPublicWebInput {
  query: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
}

function endpointUrl(path: string, query: string, count: number): string {
  const url = new URL(`${BRAVE_ORIGIN}${path}`);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('safesearch', 'strict');
  return url.toString();
}

/**
 * Resolves to the parsed endpoint payload, or rejects with a message that carries
 * neither the subscription token nor the provider's response body.
 */
async function fetchEndpoint(args: {
  path: string;
  count: number;
  query: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}): Promise<unknown> {
  const response = await args.fetchImpl(endpointUrl(args.path, args.query, args.count), {
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip',
      'x-subscription-token': args.apiKey
    },
    signal: args.signal
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Brave ${args.path} responded with HTTP ${response.status}.`);
  }
  return (await response.json()) as unknown;
}

function payloadOf(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'fulfilled' ? result.value : undefined;
}

/**
 * Grounds a lesson AI turn in public web, image, and video results. Fail-soft by
 * design: an unconfigured key, a blank query, a timeout, or provider failures all
 * resolve to an unavailable pack rather than throwing at the caller.
 */
export async function searchPublicWeb(input: SearchPublicWebInput): Promise<SearchPack> {
  const searchedAt = (input.now ?? (() => new Date().toISOString()))();
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (!apiKey || !query) return emptySearchPack(query, searchedAt);

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs =
    typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
      ? input.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const shared = { query, apiKey, fetchImpl, signal: controller.signal };
    const [web, images, videos] = await Promise.allSettled([
      fetchEndpoint({ ...shared, path: '/web/search', count: WEB_RESULT_COUNT }),
      fetchEndpoint({ ...shared, path: '/images/search', count: MEDIA_RESULT_COUNT }),
      fetchEndpoint({ ...shared, path: '/videos/search', count: MEDIA_RESULT_COUNT })
    ]);

    return normalizeBraveSearchResults({
      query,
      searchedAt,
      web: payloadOf(web),
      images: payloadOf(images),
      videos: payloadOf(videos)
    });
  } finally {
    clearTimeout(timeout);
  }
}
