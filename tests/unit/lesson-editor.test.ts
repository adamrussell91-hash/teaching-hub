import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn()
  };
});

import { apiGet, apiPut, apiPost, apiPatch, ApiClientError } from '@/api/client';
import { mountLessonEditor } from '@/teacher/lesson-editor';
import { renderTeacherShell } from '@/teacher/shell';

const apiGetMock = apiGet as unknown as ReturnType<typeof vi.fn>;
const apiPutMock = apiPut as unknown as ReturnType<typeof vi.fn>;
const apiPostMock = apiPost as unknown as ReturnType<typeof vi.fn>;
const apiPatchMock = apiPatch as unknown as ReturnType<typeof vi.fn>;

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

  function mockLessonLoad(lesson: Lesson = makeLesson()): void {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [] };
      }
      if (path.startsWith('/api/lessons/')) {
        return lesson;
      }
      if (path.startsWith('/api/compositions/')) {
        throw new ApiClientError({ code: 'not_found', message: 'Composition not found' });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
  }

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPutMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    container = document.createElement('div');
    refs = renderTeacherShell(container);
  });

  it('loads the draft and renders an inline-editable title labelled "Lesson title"', async () => {
    mockLessonLoad();
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
    mockLessonLoad();
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
    mockLessonLoad();
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => true });
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__title-input')).toBeNull();
  });

  it('Add Block appends a new block of the selected type with a generated id', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
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

  it('Add Block can append an image block', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const select = refs.canvas.querySelector<HTMLSelectElement>('.lesson-editor__add-block-select')!;
    select.value = 'image';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__add-block-button')!.click();
    await tick();

    expect(refs.canvas.querySelector('.block-editor[data-block-type="image"]')).not.toBeNull();
  });

  it('reorders blocks up and down and disables buttons at the boundaries', async () => {
    const second: Block = { ...richTextBlock, id: 'block_lesson_001_2' };
    mockLessonLoad(makeLesson({ blocks: [richTextBlock, second] }));
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
    mockLessonLoad();
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    const link = refs.canvas.querySelector<HTMLAnchorElement>('.lesson-editor__publish-link');
    expect(link?.getAttribute('href')).toBe('/s/lessons/lesson_001');
  });

  it('wires Publish failure into a checklist of issues', async () => {
    mockLessonLoad();
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
    mockLessonLoad();
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
    mockLessonLoad();

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

  it('shows Save as composition on section rows and posts to /api/compositions', async () => {
    const section: Block = {
      id: 'block_lesson_001_1',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Do Now', blocks: [] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    mockLessonLoad(makeLesson({ blocks: [section] }));
    apiPostMock.mockResolvedValue({
      id: 'composition_1',
      type: 'composition_template',
      title: 'Do Now',
      slug: 'do-now',
      status: 'active',
      root: section,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Do Now pack');

    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__save-composition')).not.toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__insert-composition-copy')).not.toBeNull();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__save-composition')!.click();
    await tick();

    expect(promptSpy).toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/compositions',
      expect.objectContaining({ title: 'Do Now pack', root: expect.objectContaining({ id: section.id }) })
    );
    promptSpy.mockRestore();
  });

  it('inserts a composition as an independent section copy', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Exit ticket', blocks: [] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Exit ticket', updated_at: ISO }] };
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Exit ticket',
          slug: 'exit-ticket',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const select = refs.canvas.querySelector<HTMLSelectElement>('.lesson-editor__composition-select')!;
    expect(select.disabled).toBe(false);
    select.value = 'composition_1';
    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__insert-composition-copy')!.click();
    await tick();

    const editor = refs.canvas.querySelector<HTMLElement>('.block-editor[data-block-type="section"]');
    expect(editor).not.toBeNull();
    expect(editor?.dataset.blockId).toBe('block_lesson_001_1');
    expect(editor?.dataset.blockId).not.toBe('block_template_root');
  });

  it('Insert linked appends a linked section stub', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [
          {
            id: 'block_child_1',
            type: 'block',
            block_type: 'rich_text',
            variant: 'medium',
            visibility: 'student_teacher',
            content: { html: '<p>Read</p>' },
            layout: {},
            print: {},
            settings: {},
            created_at: ISO,
            updated_at: ISO,
            schema_version: 1
          }
        ]
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const composition = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active' as const,
      root: templateRoot,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1 as const
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/compositions/composition_1') {
        return composition;
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPutMock.mockResolvedValue(makeLesson());

    const handle = mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();

    const select = refs.canvas.querySelector<HTMLSelectElement>('.lesson-editor__composition-select')!;
    select.value = 'composition_1';
    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__insert-composition-linked')!.click();
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__linked-badge')?.textContent).toBe('Linked');
    expect(refs.canvas.querySelector('.block-editor')).toBeNull();

    await handle.flush();
    expect(apiPutMock).toHaveBeenCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            block_type: 'section',
            content: expect.objectContaining({
              link: {
                mode: 'linked',
                source_composition_id: 'composition_1'
              }
            })
          })
        ]
      })
    );
  });

  it('Detach expands linked stub into independent section', async () => {
    const child: Block = {
      id: 'block_child_1',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>Read</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [child] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const linkedStub: Block = {
      id: 'block_lesson_001_1',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [],
        link: { mode: 'linked', source_composition_id: 'composition_1' }
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Reading pack',
          slug: 'reading-pack',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPutMock.mockResolvedValue(makeLesson());

    const handle = mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__detach-composition')!.click();
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__linked-badge')).toBeNull();
    expect(refs.canvas.querySelector('.block-editor[data-block-type="section"]')).not.toBeNull();

    await handle.flush();
    const saved = apiPutMock.mock.calls.at(-1)?.[1] as Lesson;
    const section = saved.blocks[0];
    expect(section?.block_type).toBe('section');
    if (section?.block_type === 'section') {
      expect(section.content.link).toBeUndefined();
      expect(section.content.title).toBe('Reading pack');
      expect(section.content.blocks.length).toBeGreaterThan(0);
    }
  });

  it('linked row has no Save as composition control', async () => {
    const linkedStub: Block = {
      id: 'block_lesson_001_1',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [],
        link: { mode: 'linked', source_composition_id: 'composition_1' }
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [] };
      }
      if (path === '/api/compositions/composition_1') {
        throw new ApiClientError({ code: 'not_found', message: 'Composition not found' });
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();
    await tick();

    const row = refs.canvas.querySelector('.lesson-editor__block-row')!;
    expect(row.querySelector('.lesson-editor__save-composition')).toBeNull();
    expect(row.querySelector('.lesson-editor__linked-badge')?.textContent).toBe('Linked');
    expect(row.querySelector('.lesson-editor__edit-source')).not.toBeNull();
    expect(row.querySelector('.lesson-editor__detach-composition')).not.toBeNull();
  });

  it('Edit Source saves composition via PATCH and refreshes preview', async () => {
    const child: Block = {
      id: 'block_child_1',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>Read</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [child] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const linkedStub: Block = {
      id: 'block_lesson_001_1',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [],
        link: { mode: 'linked', source_composition_id: 'composition_1' }
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const composition = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active' as const,
      root: templateRoot,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1 as const
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/compositions/composition_1') {
        return composition;
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPatchMock.mockResolvedValue({
      ...composition,
      title: 'Updated reading pack'
    });

    mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__edit-source')!.click();
    await tick();

    const dialog = document.querySelector<HTMLDialogElement>('.lesson-editor__composition-modal');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(true);

    const titleInput = dialog!.querySelector<HTMLInputElement>(
      '.lesson-editor__composition-modal-title'
    )!;
    titleInput.value = 'Updated reading pack';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    dialog!.querySelector<HTMLButtonElement>('.lesson-editor__composition-modal-save')!.click();
    await tick();

    expect(apiPatchMock).toHaveBeenCalledWith(
      '/api/compositions/composition_1',
      expect.objectContaining({ title: 'Updated reading pack' })
    );
    expect(document.querySelector('.lesson-editor__composition-modal')).toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__linked-title')?.textContent).toBe(
      'Updated reading pack'
    );
  });

  it('dispose while Edit Source modal open removes dialog', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const linkedStub: Block = {
      id: 'block_lesson_001_1',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [],
        link: { mode: 'linked', source_composition_id: 'composition_1' }
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Reading pack',
          slug: 'reading-pack',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub] });
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    const handle = mountLessonEditor({ refs, lessonId: 'lesson_001', isStale: () => false });
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__edit-source')!.click();
    await tick();

    expect(document.querySelector('.lesson-editor__composition-modal')).not.toBeNull();

    handle.dispose();

    expect(document.querySelector('.lesson-editor__composition-modal')).toBeNull();
  });
});
