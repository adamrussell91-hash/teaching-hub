import { apiGet, apiPost, ApiClientError } from '@/api/client';
import {
  LESSON_BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  cloneBlockWithNewIds,
  createFromInsertMenu,
  expandGroupTypesForMenu,
  type InsertMenuValue
} from '@/blocks/create-block';
import { insertCompositionRoot } from '@/blocks/composition-insert';
import { createBlockEditor } from '@/blocks/registry';
import type { CompositionSummary, CompositionTemplate } from '@/schemas/composition';
import type { Lesson } from '@/schemas/lesson';
import { renderContextBar, type TeacherShellRefs } from '@/teacher/shell';
import { mountSavePublishControls, SaveController, type SavePublishHandle } from '@/teacher/save-publish';

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
    for (const group of LESSON_BLOCK_GROUPS) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const type of expandGroupTypesForMenu(group.types)) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = INSERT_MENU_LABEL[type];
        optgroup.append(opt);
      }
      addSelect.append(optgroup);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--secondary lesson-editor__add-block-button';
    addButton.textContent = 'Add block';

    const compositionSelectId = `insert-composition-${lesson.id}`;
    const compositionLabel = document.createElement('label');
    compositionLabel.className = 'lesson-editor__add-block-label';
    compositionLabel.htmlFor = compositionSelectId;
    compositionLabel.textContent = 'Composition';

    const compositionSelect = document.createElement('select');
    compositionSelect.id = compositionSelectId;
    compositionSelect.className = 'lesson-editor__composition-select';

    const compositionButton = document.createElement('button');
    compositionButton.type = 'button';
    compositionButton.className = 'btn btn--secondary lesson-editor__insert-composition-button';
    compositionButton.textContent = 'Insert composition';

    const compositionStatus = document.createElement('p');
    compositionStatus.className = 'lesson-editor__composition-status';
    compositionStatus.hidden = true;

    addBlockBar.append(
      addLabel,
      addSelect,
      addButton,
      compositionLabel,
      compositionSelect,
      compositionButton
    );

    refs.canvas.append(publishPanel, titleField, blocksContainer, addBlockBar, compositionStatus);

    function markDirty(): void {
      saveController?.notifyChange();
    }

    function setCompositionStatus(text: string | null): void {
      if (!text) {
        compositionStatus.hidden = true;
        compositionStatus.textContent = '';
        return;
      }
      compositionStatus.hidden = false;
      compositionStatus.textContent = text;
    }

    function fillCompositionSelect(compositions: CompositionSummary[]): void {
      compositionSelect.replaceChildren();
      if (compositions.length === 0) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'No compositions yet';
        compositionSelect.append(empty);
        compositionSelect.disabled = true;
        compositionButton.disabled = true;
        return;
      }
      compositionSelect.disabled = false;
      compositionButton.disabled = false;
      for (const row of compositions) {
        const opt = document.createElement('option');
        opt.value = row.id;
        opt.textContent = row.title;
        compositionSelect.append(opt);
      }
    }

    async function refreshCompositions(): Promise<void> {
      try {
        const data = await apiGet<{ compositions: CompositionSummary[] }>('/api/compositions');
        fillCompositionSelect(data.compositions);
      } catch {
        fillCompositionSelect([]);
        setCompositionStatus('Unable to load compositions.');
      }
    }

    void refreshCompositions();

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

        const duplicateButton = document.createElement('button');
        duplicateButton.type = 'button';
        duplicateButton.className = 'btn btn--ghost lesson-editor__duplicate';
        duplicateButton.textContent = 'Duplicate';
        duplicateButton.setAttribute('aria-label', `Duplicate block ${index + 1}`);
        duplicateButton.addEventListener('click', () => duplicateBlock(index));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn--ghost lesson-editor__delete';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('aria-label', `Delete block ${index + 1}`);
        deleteButton.addEventListener('click', () => deleteBlock(index));

        controls.append(upButton, downButton, duplicateButton, deleteButton);

        if (block.block_type === 'section') {
          const saveCompositionButton = document.createElement('button');
          saveCompositionButton.type = 'button';
          saveCompositionButton.className = 'btn btn--ghost lesson-editor__save-composition';
          saveCompositionButton.textContent = 'Save as composition';
          saveCompositionButton.setAttribute(
            'aria-label',
            `Save block ${index + 1} as composition`
          );
          saveCompositionButton.addEventListener('click', () => {
            void saveBlockAsComposition(index);
          });
          controls.append(saveCompositionButton);
        }

        const editor = createBlockEditor(
          block,
          (updated) => {
            lesson.blocks[index] = updated;
            markDirty();
          },
          () => lesson.blocks[index]!
        );

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

    function deleteBlock(index: number): void {
      lesson.blocks.splice(index, 1);
      markDirty();
      renderBlocksList();
    }

    function duplicateBlock(index: number): void {
      const source = lesson.blocks[index];
      if (!source) return;
      const clone = cloneBlockWithNewIds(source, () => {
        blockCounter += 1;
        return `block_${lesson.id}_${blockCounter}`;
      });
      lesson.blocks.splice(index + 1, 0, clone);
      markDirty();
      renderBlocksList();
    }

    async function saveBlockAsComposition(index: number): Promise<void> {
      const block = lesson.blocks[index];
      if (!block || block.block_type !== 'section') return;
      const defaultTitle = block.content.title.trim() || 'Composition';
      const title = window.prompt('Composition name', defaultTitle);
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed) {
        setCompositionStatus('Composition name is required.');
        return;
      }
      try {
        await apiPost<CompositionTemplate>('/api/compositions', {
          title: trimmed,
          root: block
        });
        setCompositionStatus(`Saved “${trimmed}” as a composition.`);
        await refreshCompositions();
      } catch {
        setCompositionStatus('Unable to save composition.');
      }
    }

    async function insertSelectedComposition(): Promise<void> {
      const id = compositionSelect.value;
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        const clone = insertCompositionRoot(full.root, () => {
          blockCounter += 1;
          return `block_${lesson.id}_${blockCounter}`;
        });
        lesson.blocks.push(clone);
        markDirty();
        renderBlocksList();
        setCompositionStatus(`Inserted “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to insert composition.');
      }
    }

    function addBlock(type: InsertMenuValue): void {
      blockCounter += 1;
      const id = `block_${lesson.id}_${blockCounter}`;
      lesson.blocks.push(createFromInsertMenu(type, id));
      markDirty();
      renderBlocksList();
    }

    titleInput.addEventListener('input', () => {
      lesson.title = titleInput.value;
      markDirty();
    });

    addButton.addEventListener('click', () => {
      addBlock(addSelect.value as InsertMenuValue);
    });

    compositionButton.addEventListener('click', () => {
      void insertSelectedComposition();
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
