// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockApi, loadSeedFile } from '../../scripts/mock-api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const seed = loadSeedFile(path.resolve(root, '../../fixtures/seed.json'));
const PASSPHRASE = 'teaching-hub-local';

describe('mock /api/ai/jobs', () => {
  it('requires auth and starts a job that completes with a replace_lesson proposal', async () => {
    const api = createMockApi({ seed, passphrase: PASSPHRASE });
    const unauth = await api.request('POST', '/api/ai/jobs', {
      body: {
        lesson_id: 'x',
        agent: 'clementine',
        message: 'Build a lesson on X with six block types'
      }
    });
    expect(unauth.status).toBe(401);

    const auth = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    expect(auth.status).toBe(200);
    const cookie = auth.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const curriculum = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculum.status).toBe(200);
    const data = (await curriculum.json()) as {
      ok: boolean;
      data: { lessons: Array<{ id: string }> };
    };
    const lessonId = data.data.lessons[0]?.id;
    expect(lessonId).toBeTruthy();

    const unknownLesson = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: {
        lesson_id: 'does-not-exist',
        agent: 'clementine',
        message: 'Build a lesson on X with six block types'
      }
    });
    expect(unknownLesson.status).toBe(404);

    const created = await api.request('POST', '/api/ai/jobs', {
      cookie,
      body: {
        lesson_id: lessonId,
        agent: 'clementine',
        message: 'Build a lesson on X with six block types'
      }
    });
    expect(created.status).toBe(202);
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { id: string; status: string };
    };
    expect(createdBody.ok).toBe(true);
    expect(createdBody.data.status).toBe('working');
    expect(createdBody.data.id).toBeTruthy();

    const unknownJob = await api.request('GET', '/api/ai/jobs/missing-job', { cookie });
    expect(unknownJob.status).toBe(404);

    const polled = await api.request('GET', `/api/ai/jobs/${createdBody.data.id}`, { cookie });
    expect(polled.status).toBe(200);
    const job = (await polled.json()) as {
      ok: boolean;
      data: {
        id: string;
        status: string;
        proposal?: { kind: string; blocks?: unknown[] };
      };
    };
    expect(job.ok).toBe(true);
    expect(job.data.status).toBe('done');
    expect(job.data.proposal?.kind).toBe('replace_lesson');
    expect(Array.isArray(job.data.proposal?.blocks)).toBe(true);
    expect(job.data.proposal?.blocks?.length).toBeGreaterThan(0);
  });
});
