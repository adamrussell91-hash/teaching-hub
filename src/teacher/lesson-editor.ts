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
import {
  createLinkedSectionStub,
  isCompositionUsable,
  isLinkedSection
} from '@/blocks/composition-link';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { createBlockEditor } from '@/blocks/registry';
import { findBlockById } from '@/blocks/find-block';
import { applyProposalToBlocks } from '@/ai/apply-proposal';
import type { AiProposal } from '@/ai/proposals';
import type { AiScope } from '@/ai/proposals';
import type { CompositionSummary, CompositionTemplate } from '@/schemas/composition';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import { mountA4Preview, type A4PreviewHandle } from '@/teacher/a4-preview';
import {
  mountHistoryPanel,
  type HistoryPanelHandle
} from '@/teacher/history-panel';
import {
  buildLinkedPreview,
  ensureCompositionCached,
  openEditSourceModal,
  type CompositionCache
} from '@/teacher/lesson-editor-compositions';
import { mountAiPanel, type AiPanelHandle } from '@/teacher/ai-panel';
import { createLessonTemplate } from '@/teacher/template-api';
import { fetchCurriculum } from '@/teacher/nav';
import { mountCoverPicker } from '@/teacher/cover-picker';
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
  /** Scrolls/focuses the mounted A4 preview host when present. */
  openA4Preview(): void;
  /** Runs the existing save/publish control path when the editor is ready. */
  publish(): void;
}

export interface MountLessonEditorOptions {
  refs: TeacherShellRefs;
  lessonId: string;
  /** Returns true if this mount has been superseded by a newer route render. */
  isStale: () => boolean;
  /** Image media for cover library picker. */
  media?: Media[];
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
  const { refs, lessonId, isStale, media = [] } = options;

  let disposed = false;
  let saveController: SaveController | null = null;
  let savePublishHandle: SavePublishHandle | null = null;
  let historyPanel: HistoryPanelHandle | null = null;
  let a4Preview: A4PreviewHandle | null = null;
  let closeEditSourceModal: (() => void) | null = null;
  let editSourceOpenSeq = 0;
  let aiPanel: AiPanelHandle | null = null;

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
    let mediaList: Media[] = [];

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

    const coverHost = document.createElement('div');
    coverHost.className = 'lesson-editor__cover';
    mountCoverPicker(coverHost, {
      cover: lesson.cover,
      media,
      titleFallback: lesson.title,
      onSave: async (cover) => {
        if (cover === null) {
          delete lesson.cover;
        } else {
          lesson.cover = cover;
        }
        saveController?.notifyChange();
      }
    });

    const saveLessonTemplateButton = document.createElement('button');
    saveLessonTemplateButton.type = 'button';
    saveLessonTemplateButton.className = 'btn btn--secondary lesson-editor__save-lesson-template';
    saveLessonTemplateButton.textContent = 'Save as lesson template';

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

    const compositionCopyButton = document.createElement('button');
    compositionCopyButton.type = 'button';
    compositionCopyButton.className = 'btn btn--secondary lesson-editor__insert-composition-copy';
    compositionCopyButton.textContent = 'Insert copy';

    const compositionLinkedButton = document.createElement('button');
    compositionLinkedButton.type = 'button';
    compositionLinkedButton.className = 'btn btn--secondary lesson-editor__insert-composition-linked';
    compositionLinkedButton.textContent = 'Insert linked';

    const compositionStatus = document.createElement('p');
    compositionStatus.className = 'lesson-editor__composition-status';
    compositionStatus.hidden = true;

    addBlockBar.append(
      addLabel,
      addSelect,
      addButton,
      compositionLabel,
      compositionSelect,
      compositionCopyButton,
      compositionLinkedButton
    );

    const root = document.createElement('div');
    root.className = 'lesson-editor';

    const main = document.createElement('div');
    main.className = 'lesson-editor__main';
    main.append(
      publishPanel,
      coverHost,
      titleField,
      saveLessonTemplateButton,
      blocksContainer,
      addBlockBar,
      compositionStatus
    );

    const side = document.createElement('div');
    side.className = 'lesson-editor__side';

    const modeTabs = document.createElement('div');
    modeTabs.className = 'lesson-editor__mode-tabs';
    modeTabs.setAttribute('role', 'tablist');
    modeTabs.setAttribute('aria-label', 'Lesson side panel');

    const a4Tab = document.createElement('button');
    a4Tab.type = 'button';
    a4Tab.className = 'lesson-editor__mode-tab';
    a4Tab.setAttribute('role', 'tab');
    a4Tab.textContent = 'A4';

    const aiTab = document.createElement('button');
    aiTab.type = 'button';
    aiTab.className = 'lesson-editor__mode-tab';
    aiTab.setAttribute('role', 'tab');
    aiTab.textContent = 'AI';

    modeTabs.append(a4Tab, aiTab);

    const previewHost = document.createElement('div');
    previewHost.className = 'lesson-editor__preview';
    previewHost.setAttribute('role', 'tabpanel');

    const aiHost = document.createElement('div');
    aiHost.className = 'lesson-editor__ai';
    aiHost.setAttribute('role', 'tabpanel');

    side.append(modeTabs, previewHost, aiHost);
    root.append(main, side);
    refs.canvas.append(root);

    let selectedBlockId: string | null = null;
    let sideMode: 'a4' | 'ai' = 'a4';
    try {
      const stored = sessionStorage.getItem(`teaching_hub_lesson_side_${lessonId}`);
      if (stored === 'ai' || stored === 'a4') sideMode = stored;
    } catch {
      /* ignore */
    }

    a4Preview = mountA4Preview(previewHost);
    a4Preview.update(lesson);

    aiPanel = mountAiPanel(aiHost, {
      lessonId,
      getSnapshotAt: () => lesson.updated_at,
      onAcceptProposal: (proposal: AiProposal) => {
        const result = applyProposalToBlocks(lesson.blocks, proposal, () => {
          blockCounter += 1;
          return `block_${lesson.id}_${blockCounter}`;
        });
        if (!result.ok) return result;
        lesson.blocks = result.blocks;
        renderBlocksList();
        syncSelectionUi();
        void saveController?.saveNow({ checkpointReason: 'ai_accepted' });
        return { ok: true };
      }
    });

    function setSideMode(mode: 'a4' | 'ai'): void {
      sideMode = mode;
      try {
        sessionStorage.setItem(`teaching_hub_lesson_side_${lessonId}`, mode);
      } catch {
        /* ignore */
      }
      const showA4 = mode === 'a4';
      previewHost.hidden = !showA4;
      aiHost.hidden = showA4;
      a4Tab.classList.toggle('lesson-editor__mode-tab--active', showA4);
      aiTab.classList.toggle('lesson-editor__mode-tab--active', !showA4);
      a4Tab.setAttribute('aria-selected', showA4 ? 'true' : 'false');
      aiTab.setAttribute('aria-selected', showA4 ? 'false' : 'true');
    }

    a4Tab.addEventListener('click', () => setSideMode('a4'));
    aiTab.addEventListener('click', () => setSideMode('ai'));
    setSideMode(sideMode);

    function syncAiSelection(): void {
      if (!selectedBlockId) {
        aiPanel?.setSelection({ blockId: null, blockType: null, scope: 'block' });
        return;
      }
      const block = findBlockById(lesson.blocks, selectedBlockId);
      const scope: AiScope = block?.block_type === 'section' ? 'section' : 'block';
      aiPanel?.setSelection({
        blockId: selectedBlockId,
        blockType: block?.block_type ?? null,
        scope
      });
    }

    function syncSelectionUi(): void {
      for (const row of blocksContainer.querySelectorAll('.lesson-editor__block-row')) {
        row.classList.remove('lesson-editor__block-row--selected');
      }
      for (const editor of blocksContainer.querySelectorAll('.block-editor')) {
        editor.classList.remove('block-editor--selected');
      }
      if (!selectedBlockId) {
        syncAiSelection();
        return;
      }
      const selectedEditor = blocksContainer.querySelector(
        `.block-editor[data-block-id="${CSS.escape(selectedBlockId)}"]`
      );
      selectedEditor?.classList.add('block-editor--selected');
      selectedEditor?.closest('.lesson-editor__block-row')?.classList.add('lesson-editor__block-row--selected');
      syncAiSelection();
    }

    blocksContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('button, a, input, textarea, select, label')) return;
      const editor = target.closest('.block-editor') as HTMLElement | null;
      const id = editor?.dataset.blockId;
      if (!id) return;
      selectedBlockId = id;
      syncSelectionUi();
    });

    function markDirty(): void {
      saveController?.notifyChange();
      a4Preview?.update(lesson);
    }

    const compositionCache: CompositionCache = new Map();
    const compositionFetchInFlight = new Set<string>();

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
        compositionCopyButton.disabled = true;
        compositionLinkedButton.disabled = true;
        return;
      }
      compositionSelect.disabled = false;
      compositionCopyButton.disabled = false;
      compositionLinkedButton.disabled = false;
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

    function queueCompositionFetch(compositionId: string): void {
      ensureCompositionCached({
        compositionId,
        cache: compositionCache,
        inFlight: compositionFetchInFlight,
        onSettled: () => {
          if (!disposed && !isStale()) {
            renderBlocksList();
          }
        }
      });
    }

    function renderLinkedPreview(compositionId: string): HTMLElement {
      return buildLinkedPreview(compositionId, compositionCache, queueCompositionFetch);
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
        if (isLinkedSection(block)) {
          row.classList.add('lesson-editor__block-row--linked');
        }

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
        duplicateButton.disabled = isLinkedSection(block);
        if (!isLinkedSection(block)) {
          duplicateButton.addEventListener('click', () => duplicateBlock(index));
        }

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn--ghost lesson-editor__delete';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('aria-label', `Delete block ${index + 1}`);
        deleteButton.addEventListener('click', () => deleteBlock(index));

        controls.append(upButton, downButton, duplicateButton, deleteButton);

        if (isLinkedSection(block)) {
          const editSourceButton = document.createElement('button');
          editSourceButton.type = 'button';
          editSourceButton.className = 'btn btn--ghost lesson-editor__edit-source';
          editSourceButton.textContent = 'Edit Source';
          editSourceButton.setAttribute('aria-label', `Edit source for block ${index + 1}`);
          editSourceButton.addEventListener('click', () => {
            closeEditSourceModal?.();
            closeEditSourceModal = null;
            const openSeq = ++editSourceOpenSeq;
            void openEditSourceModal({
              compositionId: block.content.link.source_composition_id,
              media: mediaList,
              setStatus: setCompositionStatus,
              onSaved: (updated) => {
                compositionCache.set(updated.id, updated);
                setCompositionStatus(`Saved “${updated.title}”.`);
                renderBlocksList();
              }
            }).then((modal) => {
              if (disposed || isStale() || openSeq !== editSourceOpenSeq) {
                modal.close();
                return;
              }
              closeEditSourceModal = () => {
                modal.close();
                closeEditSourceModal = null;
              };
            });
          });

          const detachButton = document.createElement('button');
          detachButton.type = 'button';
          detachButton.className = 'btn btn--ghost lesson-editor__detach-composition';
          detachButton.textContent = 'Detach';
          detachButton.setAttribute('aria-label', `Detach linked composition ${index + 1}`);
          detachButton.addEventListener('click', () => {
            void detachLinkedSection(index);
          });

          controls.append(editSourceButton, detachButton);

          const badge = document.createElement('span');
          badge.className = 'lesson-editor__linked-badge';
          badge.textContent = 'Linked';

          const body = document.createElement('div');
          body.className = 'lesson-editor__linked-body';
          body.append(badge, renderLinkedPreview(block.content.link.source_composition_id));

          row.append(controls, body);
          blocksContainer.append(row);
          return;
        }

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
          () => lesson.blocks[index]!,
          { media: mediaList }
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

    async function saveLessonAsTemplate(): Promise<void> {
      const suggested = lesson.title.trim() || 'Lesson template';
      const title = window.prompt('Lesson template name', suggested);
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed) {
        setCompositionStatus('Lesson template name is required.');
        return;
      }
      try {
        await createLessonTemplate({
          title: trimmed,
          blocks: cloneBlocksWithNewIds(lesson.blocks)
        });
        setCompositionStatus(`Saved “${trimmed}” as a lesson template.`);
      } catch {
        setCompositionStatus('Unable to save lesson template.');
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

    async function insertLinkedComposition(): Promise<void> {
      const id = compositionSelect.value;
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Composition is not available to link.');
          return;
        }
        blockCounter += 1;
        const stub = createLinkedSectionStub({
          id: `block_${lesson.id}_${blockCounter}`,
          sourceCompositionId: full.id,
          titleHint: full.title
        });
        compositionCache.set(full.id, full);
        lesson.blocks.push(stub);
        markDirty();
        renderBlocksList();
        setCompositionStatus(`Linked “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to link composition.');
      }
    }

    async function detachLinkedSection(index: number): Promise<void> {
      const block = lesson.blocks[index];
      if (!block || !isLinkedSection(block)) return;
      try {
        const full = await apiGet<CompositionTemplate>(
          `/api/compositions/${block.content.link.source_composition_id}`
        );
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Unable to detach — composition missing or archived.');
          return;
        }
        const independent = insertCompositionRoot(full.root, () => {
          blockCounter += 1;
          return `block_${lesson.id}_${blockCounter}`;
        });
        lesson.blocks[index] = independent;
        markDirty();
        renderBlocksList();
        setCompositionStatus('Detached composition into this lesson.');
      } catch {
        setCompositionStatus('Unable to detach composition.');
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

    saveLessonTemplateButton.addEventListener('click', () => {
      void saveLessonAsTemplate();
    });

    compositionCopyButton.addEventListener('click', () => {
      void insertSelectedComposition();
    });

    compositionLinkedButton.addEventListener('click', () => {
      void insertLinkedComposition();
    });

    renderBlocksList();

    void fetchCurriculum()
      .then((curriculum) => {
        if (disposed || isStale()) return;
        mediaList = curriculum.media;
        renderBlocksList();
      })
      .catch(() => {
        /* library picker stays empty */
      });

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
      onPublishFailure: showPublishIssues,
      getPublishMediaContext: () => ({
        blocks: lesson.blocks,
        media: mediaList
      })
    });

    const historyHost = document.createElement('div');
    historyHost.className = 'history-panel-host context-bar__history';
    const actions = refs.contextBar.querySelector('.context-bar__actions');
    if (actions) {
      actions.append(historyHost);
    } else {
      refs.contextBar.append(historyHost);
    }

    function applyRestoredLesson(restored: Lesson): void {
      Object.assign(lesson, restored);
      titleInput.value = lesson.title;
      blockCounter = lesson.blocks.length;
      renderBlocksList();
      a4Preview?.update(lesson);
      const titleEl = refs.contextBar.querySelector('.teacher-layout__context-bar-title');
      if (titleEl) titleEl.textContent = lesson.title || 'Untitled lesson';
    }

    historyPanel = mountHistoryPanel({
      kind: 'lesson',
      parentId: lesson.id,
      host: historyHost,
      onRestored: (live) => {
        applyRestoredLesson(live as Lesson);
      }
    });
  }

  return {
    flush() {
      return saveController?.flush() ?? Promise.resolve();
    },
    dispose() {
      disposed = true;
      closeEditSourceModal?.();
      closeEditSourceModal = null;
      a4Preview?.dispose();
      a4Preview = null;
      historyPanel?.dispose();
      historyPanel = null;
      aiPanel?.dispose();
      aiPanel = null;
      savePublishHandle?.dispose();
      saveController?.dispose();
    },
    openA4Preview() {
      if (disposed) return;
      try {
        sessionStorage.setItem(`teaching_hub_lesson_side_${lessonId}`, 'a4');
      } catch {
        /* ignore */
      }
      const a4Button = refs.canvas.querySelector('.lesson-editor__mode-tab');
      if (a4Button instanceof HTMLButtonElement) a4Button.click();
      const preview = refs.canvas.querySelector('.a4-preview');
      if (!(preview instanceof HTMLElement)) return;
      if (!preview.hasAttribute('tabindex')) {
        preview.tabIndex = -1;
      }
      preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      preview.focus({ preventScroll: true });
    },
    publish() {
      if (disposed) return;
      const publishButton = refs.contextBar.querySelector<HTMLButtonElement>(
        '.context-bar__publish'
      );
      if (publishButton) {
        publishButton.click();
        return;
      }
      void saveController?.publish();
    }
  };
}
