import { apiGet, ApiClientError } from '@/api/client';
import { createBlockEditor } from '@/blocks/registry';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { renderContextBar, type TeacherShellRefs } from '@/teacher/shell';
import { mountSavePublishControls, SaveController, type SavePublishHandle } from '@/teacher/save-publish';

const NEW_BLOCK_TYPES = ['rich_text', 'heading', 'callout'] as const;
type NewBlockType = (typeof NEW_BLOCK_TYPES)[number];

const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  rich_text: 'Rich text',
  heading: 'Heading',
  callout: 'Callout'
};

function nowIso(): string {
  return new Date().toISOString();
}

function createBlock(type: NewBlockType, id: string): Block {
  const shared = {
    id,
    type: 'block' as const,
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    created_at: nowIso(),
    updated_at: nowIso(),
    schema_version: 1 as const
  };

  switch (type) {
    case 'rich_text':
      return { ...shared, block_type: 'rich_text', variant: 'medium', content: { html: '' } };
    case 'heading':
      return { ...shared, block_type: 'heading', variant: 'section', content: { text: '' } };
    case 'callout':
      return {
        ...shared,
        block_type: 'callout',
        variant: 'medium',
        content: { style: 'information', body: '' }
      };
  }
}

export interface LessonEditorHandle {
  /**
   * Cancels any pending autosave debounce and, if there are unsaved (or
   * in-flight) edits, returns a promise that resolves once the draft has
   * been fully persisted. Callers must await this before calling `dispose`
   * — disposing while a flush is still pending can drop a queued resave.
   */
  flush(): Promise<void>;
  /** Tears down subscriptions/timers. Only call after awaiting `flush`. */
  dispose(): void;
}

export interface MountLessonEditorOptions {
  refs: TeacherShellRefs;
  lessonId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale: () => boolean;
}

function renderStatus(canvas: HTMLElement, text: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  canvas.append(status);
}

/**
 * Loads a lesson draft and renders the teacher editor: inline title, block
 * list with reorder/visibility controls, an Add Block menu, and wires
 * save/publish controls into the context bar.
 */
export function mountLessonEditor(options: MountLessonEditorOptions): LessonEditorHandle {
  const { refs, lessonId, isStale } = options;

  let disposed = false;
  let saveController: SaveController | null = null;
  let savePublishHandle: SavePublishHandle | null = null;

  renderStatus(refs.canvas, 'Loading lesson…');

  void apiGet<Lesson>(`/api/lessons/${lessonId}`)
    .then((lesson) => {
      if (disposed || isStale()) return;
      renderEditor(lesson);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Lesson not found.'
          : 'Unable to load lesson. Please refresh to try again.';
      renderStatus(refs.canvas, message);
    });

  function renderEditor(initialLesson: Lesson): void {
    const lesson: Lesson = initialLesson;
    let blockCounter = lesson.blocks.length;

    renderContextBar(refs, { title: lesson.title || 'Untitled lesson' });
    refs.canvas.replaceChildren();

    const publishPanel = document.createElement('div');
    publishPanel.className = 'lesson-editor__publish-panel';
    publishPanel.hidden = true;

    const titleField = document.createElement('div');
    titleField.className = 'lesson-editor__title-field';

    const titleInputId = `lesson-title-${lesson.id}`;
    const titleLabel = document.createElement('label');
    titleLabel.className = 'lesson-editor__title-label';
    titleLabel.htmlFor = titleInputId;
    titleLabel.textContent = 'Lesson title';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = titleInputId;
    titleInput.className = 'lesson-editor__title-input';
    titleInput.value = lesson.title;
    titleInput.autocomplete = 'off';

    titleField.append(titleLabel, titleInput);

    const blocksContainer = document.createElement('div');
    blocksContainer.className = 'lesson-editor__blocks';

    const addBlockBar = document.createElement('div');
    addBlockBar.className = 'lesson-editor__add-block';

    const addSelectId = `add-block-type-${lesson.id}`;
    const addLabel = document.createElement('label');
    addLabel.className = 'lesson-editor__add-block-label';
    addLabel.htmlFor = addSelectId;
    addLabel.textContent = 'Add block';

    const addSelect = document.createElement('select');
    addSelect.id = addSelectId;
    addSelect.className = 'lesson-editor__add-block-select';
    for (const type of NEW_BLOCK_TYPES) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = NEW_BLOCK_LABEL[type];
      addSelect.append(opt);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--secondary lesson-editor__add-block-button';
    addButton.textContent = 'Add block';

    addBlockBar.append(addLabel, addSelect, addButton);

    refs.canvas.append(publishPanel, titleField, blocksContainer, addBlockBar);

    function markDirty(): void {
      saveController?.notifyChange();
    }

    function renderBlocksList(): void {
      blocksContainer.replaceChildren();

      if (lesson.blocks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'teacher-layout__canvas-status';
        empty.textContent = 'No blocks yet. Use Add Block to get started.';
        blocksContainer.append(empty);
        return;
      }

      lesson.blocks.forEach((block, index) => {
        const row = document.createElement('div');
        row.className = 'lesson-editor__block-row';

        const controls = document.createElement('div');
        controls.className = 'lesson-editor__block-controls';

        const upButton = document.createElement('button');
        upButton.type = 'button';
        upButton.className = 'btn btn--ghost lesson-editor__reorder';
        upButton.textContent = '↑';
        upButton.setAttribute('aria-label', `Move block ${index + 1} up`);
        upButton.disabled = index === 0;
        upButton.addEventListener('click', () => moveBlock(index, -1));

        const downButton = document.createElement('button');
        downButton.type = 'button';
        downButton.className = 'btn btn--ghost lesson-editor__reorder';
        downButton.textContent = '↓';
        downButton.setAttribute('aria-label', `Move block ${index + 1} down`);
        downButton.disabled = index === lesson.blocks.length - 1;
        downButton.addEventListener('click', () => moveBlock(index, 1));

        controls.append(upButton, downButton);

        const editor = createBlockEditor(block, (updated) => {
          lesson.blocks[index] = updated;
          markDirty();
        });

        row.append(controls, editor);
        blocksContainer.append(row);
      });
    }

    function moveBlock(index: number, direction: -1 | 1): void {
      const target = index + direction;
      if (target < 0 || target >= lesson.blocks.length) return;
      const blocks = lesson.blocks;
      const temp = blocks[index]!;
      blocks[index] = blocks[target]!;
      blocks[target] = temp;
      markDirty();
      renderBlocksList();
    }

    function addBlock(type: NewBlockType): void {
      blockCounter += 1;
      const id = `block_${lesson.id}_${blockCounter}`;
      lesson.blocks.push(createBlock(type, id));
      markDirty();
      renderBlocksList();
    }

    titleInput.addEventListener('input', () => {
      lesson.title = titleInput.value;
      markDirty();
    });

    addButton.addEventListener('click', () => {
      addBlock(addSelect.value as NewBlockType);
    });

    renderBlocksList();

    function showPublishSuccess(studentPath: string): void {
      const publishedAt = new Date().toISOString();
      lesson.published_at = publishedAt;

      publishPanel.replaceChildren();
      publishPanel.hidden = false;
      publishPanel.classList.remove('lesson-editor__publish-panel--error');
      publishPanel.classList.add('lesson-editor__publish-panel--success');

      const message = document.createElement('p');
      message.textContent = 'Published. Students can now view this lesson at:';

      const link = document.createElement('a');
      link.className = 'lesson-editor__publish-link';
      link.href = studentPath;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = studentPath;

      publishPanel.append(message, link);
    }

    function showPublishIssues(issues: string[]): void {
      publishPanel.replaceChildren();
      publishPanel.hidden = false;
      publishPanel.classList.remove('lesson-editor__publish-panel--success');
      publishPanel.classList.add('lesson-editor__publish-panel--error');

      const message = document.createElement('p');
      message.textContent = "This lesson can't be published yet:";

      const list = document.createElement('ul');
      list.className = 'lesson-editor__publish-issues';
      for (const issue of issues) {
        const item = document.createElement('li');
        item.textContent = issue;
        list.append(item);
      }

      publishPanel.append(message, list);
    }

    saveController = new SaveController({
      lessonId: lesson.id,
      hasPublishedVersion: Boolean(lesson.published_at),
      debounceMs: 600,
      getLesson: () => lesson
    });

    savePublishHandle = mountSavePublishControls({
      contextBar: refs.contextBar,
      controller: saveController,
      onPublishSuccess: showPublishSuccess,
      onPublishFailure: showPublishIssues
    });
  }

  return {
    flush() {
      return saveController?.flush() ?? Promise.resolve();
    },
    dispose() {
      disposed = true;
      savePublishHandle?.dispose();
      saveController?.dispose();
    }
  };
}
