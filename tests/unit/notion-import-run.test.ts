import { describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { ApiClientError } from '@/api/client';
import type { Lesson } from '@/schemas/lesson';
import { runNotionImport } from '@/import/notion/run-import';

const HASH_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HASH_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ISO = '2026-01-01T00:00:00.000Z';

function zipBytes(entries: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();
  for (const [path, value] of Object.entries(entries)) {
    encoded[path] = typeof value === 'string' ? encoder.encode(value) : value;
  }
  return zipSync(encoded);
}

function lesson(partial: Partial<Lesson> & Pick<Lesson, 'id' | 'title' | 'unit_id'>): Lesson {
  return {
    type: 'lesson',
    slug: 'slug',
    sequence: 1,
    blocks: [],
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...partial
  };
}

describe('runNotionImport', () => {
  it('creates a lesson per markdown page, including nested files', async () => {
    const postLesson = vi.fn(async ({ title, unit_id }: { title: string; unit_id: string }) =>
      lesson({ id: `lesson_${title}`, title, unit_id })
    );
    const putLesson = vi.fn(async (next: Lesson) => next);
    const getLesson = vi.fn();

    const result = await runNotionImport({
      zipBytes: zipBytes({
        [`Parent ${HASH_A}.md`]: 'Hello parent',
        [`Parent ${HASH_A}/Child ${HASH_B}.md`]: 'Hello child'
      }),
      unitId: 'unit_1',
      existing: [],
      deps: {
        postLesson,
        getLesson,
        putLesson,
        uploadImage: vi.fn()
      }
    });

    expect(result).toEqual({ imported: 2, updated: 0, failed: 0, errors: [] });
    expect(postLesson).toHaveBeenCalledTimes(2);
    expect(putLesson.mock.calls[0][0].origin?.page_id).toBe(HASH_A);
    expect(putLesson.mock.calls[0][0].blocks[0]).toMatchObject({
      block_type: 'rich_text',
      content: { html: '<p>Hello parent</p>' }
    });
  });

  it('updates an existing lesson in the same unit instead of posting another', async () => {
    const existingLesson = lesson({
      id: 'lesson_old',
      title: 'Old',
      unit_id: 'unit_1',
      origin: { source: 'notion_export', page_id: HASH_A, export_path: `Old ${HASH_A}.md` }
    });
    const postLesson = vi.fn();
    const getLesson = vi.fn(async () => existingLesson);
    const putLesson = vi.fn(async (next: Lesson) => next);

    const result = await runNotionImport({
      zipBytes: zipBytes({ [`Memory ${HASH_A}.md`]: 'Updated body' }),
      unitId: 'unit_1',
      existing: [{ id: existingLesson.id, unit_id: 'unit_1', origin: existingLesson.origin }],
      deps: { postLesson, getLesson, putLesson, uploadImage: vi.fn() }
    });

    expect(result.updated).toBe(1);
    expect(result.imported).toBe(0);
    expect(postLesson).not.toHaveBeenCalled();
    expect(putLesson.mock.calls[0][0].title).toBe('Memory');
    expect(putLesson.mock.calls[0][0].id).toBe('lesson_old');
  });

  it('still writes the lesson when an image upload fails', async () => {
    const putLesson = vi.fn(async (next: Lesson) => next);
    const result = await runNotionImport({
      zipBytes: zipBytes({
        [`Memory ${HASH_A}.md`]: '![Classroom](photo.png)',
        'photo.png': new Uint8Array([137, 80, 78, 71])
      }),
      unitId: 'unit_1',
      existing: [],
      deps: {
        postLesson: async ({ title, unit_id }) => lesson({ id: 'lesson_1', title, unit_id }),
        getLesson: vi.fn(),
        putLesson,
        uploadImage: async () => {
          throw new Error('upload failed');
        }
      }
    });

    expect(result.imported).toBe(1);
    expect(putLesson.mock.calls[0][0].blocks[0]).toMatchObject({
      block_type: 'rich_text',
      content: { html: '<p>Missing image: Classroom</p>' }
    });
  });

  it('aborts the batch on unauthorized', async () => {
    await expect(
      runNotionImport({
        zipBytes: zipBytes({
          [`A ${HASH_A}.md`]: 'one',
          [`B ${HASH_B}.md`]: 'two'
        }),
        unitId: 'unit_1',
        existing: [],
        deps: {
          postLesson: async () => {
            throw new ApiClientError({ code: 'unauthorized', message: 'Authentication required' });
          },
          getLesson: vi.fn(),
          putLesson: vi.fn(),
          uploadImage: vi.fn()
        }
      })
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
