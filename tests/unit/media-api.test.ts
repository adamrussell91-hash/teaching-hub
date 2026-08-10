import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { Media } from '@/schemas/media';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}
function freshApi(seed: SeedData = freshSeed()) {
  return createMockApi({ seed, passphrase: PASSPHRASE });
}
async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie as string;
}

describe('media metadata API (mock)', () => {
  it('POST /api/media creates external media when authenticated', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Paste PDF',
        provider: 'external',
        media_type: 'pdf',
        preview_url: 'https://example.com/a.pdf'
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const media = body.data as Media;
    expect(media.provider).toBe('external');
    expect(media.id).toMatch(/^media_/);
    expect(media.title).toBe('Paste PDF');
    expect(media.status).toBe('active');
  });

  it('POST /api/media requires auth', async () => {
    const api = freshApi();
    const res = await api.request('POST', '/api/media', {
      body: { title: 'x', provider: 'external', media_type: 'pdf' }
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/media rejects provider direct', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/media', {
      cookie,
      body: { title: 'Nope', provider: 'direct', media_type: 'image' }
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/media/:id returns media', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const createRes = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Doc',
        provider: 'google_drive',
        media_type: 'link',
        preview_url: 'https://docs.google.com/document/d/1',
        provider_file_id: 'drive_1',
        sharing: 'restricted'
      }
    });
    const created = (await createRes.json()).data as Media;
    const getRes = await api.request('GET', `/api/media/${created.id}`, { cookie });
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()).data as Media).provider_file_id).toBe('drive_1');
  });

  it('PATCH /api/media/:id archives', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const createRes = await api.request('POST', '/api/media', {
      cookie,
      body: {
        title: 'Archive me',
        provider: 'external',
        media_type: 'pdf',
        preview_url: 'https://example.com/a.pdf'
      }
    });
    const created = (await createRes.json()).data as Media;
    const patchRes = await api.request('PATCH', `/api/media/${created.id}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()).data as Media).status).toBe('archived');
  });

  it('GET /api/media/:id 404 when missing', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/media/media_missing', { cookie });
    expect(res.status).toBe(404);
  });
});
