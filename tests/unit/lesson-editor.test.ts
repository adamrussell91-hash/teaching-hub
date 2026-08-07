import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    apiPost: vi.fn()
  };
});

import { apiGet, apiPut, apiPost, ApiClientError } from '@/api/client';
import { mountLessonEditor } from '@/teacher/lesson-editor';
import { renderTeacherShell } from '@/teacher/shell';

const apiGetMock = apiGet as unknown as ReturnType<typeof vi.fn>;
const apiPutMock = apiPut as unknown as ReturnType<typeof vi.fn>;
const apiPostMock = apiPost as unknown as ReturnType<typeof vi.fn>;

const ISO = '2026-01-01T00:00:00.000Z';

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const richTextBlock: Block = {
  id: 'block_lesson_001_1',
  type: 'block',
  block_type: 'rich_text',
  variant: 'medium',
  visibility: 'student_teacher',
  content: { html: '<p>Hello</p>' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson_001',
    type: 'lesson',
    title: 'Intro to Testing',
    slug: 'intro_to_testing',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    blocks: [richTextBlock],
    ...overrides
  };
}

describe('mountLessonEditor', () => {
  let container: HTMLElement;
  let refs: ReturnType<typeof renderTeacherShell>;

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPutMock.mockReset();
    apiPostMock.mockReset();
    container = document.createElement('div');
    refs = renderTeacherShell(container);
  });

  it('loads the draft and renders an inline-editable title labelled "Lesson title"', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    expect(apiGetMock).toHaveBeenCalledWith('/api/lessons/lesson_001');

    const label = refs.canvas.querySelector('.lesson-editor__title-label');
    const input = refs.canvas.querySelector<HTMLInputElement>('.lesson-editor__title-input');
    expect(label?.textContent).toBe('Lesson title');
    expect(input?.value).toBe('Intro to Testing');
    expect(label?.getAttribute('for')).toBe(input?.id);
  });

  it('renders one block editor per block and includes a visibility control', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const editors = refs.canvas.querySelectorAll('.block-editor');
    expect(editors).toHaveLength(1);
    expect(editors[0]?.querySelector('.block-editor__visibility')).not.toBeNull();
  });

  it('shows an error state when the lesson fails to load', async () => {
    apiGetMock.mockRejectedValue(new ApiClientError({ code: 'not_found', message: 'Lesson not found' }));
    mountLessonEditor({ refs, lessonId: 'missing', isStale: () => false });
    await tick();

    expect(refs.canvas.textContent).toContain('Lesson not found.');
  });

  it('does not touch the DOM once superseded by a newer route', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => true });
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__title-input')).toBeNull();
  });

  it('Add Block appends a new block of the selected type with a generated id', async () => {
    apiGetMock.mockResolvedValue(makeLesson({ blocks: [] }));
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    expect(refs.canvas.textContent).toContain('No blocks yet.');

    const select = refs.canvas.querySelector<HTMLSelectElement>('.lesson-editor__add-block-select')!;
    select.value = 'heading';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__add-block-button')!.click();

    const row = refs.canvas.querySelector<HTMLElement>('.lesson-editor__block-row .block-editor')!;
    expect(row.dataset.blockType).toBe('heading');
    expect(row.dataset.blockId).toBe('block_lesson_001_1');
  });

  it('reorders blocks up and down and disables buttons at the boundaries', async () => {
    const second: Block = { ...richTextBlock, id: 'block_lesson_001_2' };
    apiGetMock.mockResolvedValue(makeLesson({ blocks: [richTextBlock, second] }));
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const blockIds = () =>
      [...refs.canvas.querySelectorAll<HTMLElement>('.lesson-editor__block-row .block-editor')].map(
        (el) => el.dataset.blockId
      );
    expect(blockIds()).toEqual(['block_lesson_001_1', 'block_lesson_001_2']);

    const downButtons = () =>
      [...refs.canvas.querySelectorAll<HTMLButtonElement>('[aria-label^="Move block"][aria-label$="down"]')];
    downButtons()[0]!.click();

    expect(blockIds()).toEqual(['block_lesson_001_2', 'block_lesson_001_1']);

    const upButtons = () =>
      [...refs.canvas.querySelectorAll<HTMLButtonElement>('[aria-label^="Move block"][aria-label$="up"]')];
    expect(upButtons()[0]!.disabled).toBe(true);
    expect(downButtons()[1]!.disabled).toBe(true);
  });

  it('wires Publish success into a visible student link', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    const link = refs.canvas.querySelector<HTMLAnchorElement>('.lesson-editor__publish-link');
    expect(link?.getAttribute('href')).toBe('/s/lessons/lesson_001');
  });

  it('wires Publish failure into a checklist of issues', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    apiPostMock.mockRejectedValue(
      new ApiClientError({
        code: 'validation_error',
        message: 'Lesson is not publishable',
        details: [{ path: ['title'], message: 'Title is required to publish' }]
      })
    );
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    const issues = [...refs.canvas.querySelectorAll('.lesson-editor__publish-issues li')].map(
      (el) => el.textContent
    );
    expect(issues).toEqual(['title: Title is required to publish']);
  });

  it('flush() saves immediately, and awaiting it confirms the save completed, without waiting for the autosave debounce', async () => {
    apiGetMock.mockResolvedValue(makeLesson());
    apiPutMock.mockResolvedValue(makeLesson());
    const handle = mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const titleInput = refs.canvas.querySelector<HTMLInputElement>('.lesson-editor__title-input')!;
    titleInput.value = 'Updated title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    await handle.flush();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({ title: 'Updated title' })
    );
  });

  it('awaiting flush() before dispose() preserves an edit queued behind an in-flight autosave (route teardown)', async () => {
    apiGetMock.mockResolvedValue(makeLesson());

    let resolveFirstPut!: (value: Lesson) => void;
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstPut = resolve;
        })
    );
    apiPutMock.mockResolvedValueOnce(makeLesson());

    const handle = mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const titleInput = refs.canvas.querySelector<HTMLInputElement>('.lesson-editor__title-input')!;

    titleInput.value = 'First edit';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Kicks off the first (slow) autosave, which is still pending.
    const firstFlush = handle.flush();
    await tick();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    // A second edit arrives while that save is still in flight.
    titleInput.value = 'Second edit';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    // This mirrors `teardownLessonEditor`: await flush (which must wait for
    // the queued resave too) before disposing.
    const teardownFlush = handle.flush();

    resolveFirstPut(makeLesson());
    await firstFlush;
    await teardownFlush;
    handle.dispose();

    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(apiPutMock).toHaveBeenLastCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({ title: 'Second edit' })
    );
  });
});
