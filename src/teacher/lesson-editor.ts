import { apiGet, apiPost, ApiClientError } from '@/api/client';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import type { AiProposal, AiScope } from '@/ai/proposals';
import { insertCompositionRoot } from '@/blocks/composition-insert';
import {
  createLinkedSectionStub,
  isCompositionUsable,
  isLinkedSection
} from '@/blocks/composition-link';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { createFromInsertMenu } from '@/blocks/create-block';
import { findBlockById } from '@/blocks/find-block';
import { openPrintLesson } from '@/print/open-print';
import type { CompositionSummary, CompositionTemplate } from '@/schemas/composition';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
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
import {
  mountLessonPage,
  type LessonPageHandle
} from '@/teacher/lesson-canvas/mount-page';
import {
  mountLessonPalette,
  type LessonPaletteHandle,
  type PaletteInsertPayload
} from '@/teacher/lesson-canvas/mount-palette';
import { lessonPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import {
  readBuilderChromePrefs,
  writeBuilderChromePrefs
} from '@/teacher/lesson-canvas/prefs';
import { insertAt } from '@/teacher/lesson-canvas/drop';
import { createLessonTemplate } from '@/teacher/template-api';
import { fetchCurriculum } from '@/teacher/nav';
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
  /** Triggers print for the current lesson. */
  openA4Preview(): void;
  /** Runs the existing save/publish control path when the editor is ready. */
  publish(): void;
}

export interface MountLessonEditorOptions {
  refs: TeacherShellRefs;
  lessonId: string;
  /** Returns true if this mount has been superseded by a newer route. */
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Loads a lesson draft and renders the teacher builder: palette rail, page
 * canvas, and always-on AI chat, plus save/publish controls in the context bar.
 */
export function mountLessonEditor(options: MountLessonEditorOptions): LessonEditorHandle {
  const { refs, lessonId, isStale, media = [] } = options;

  let disposed = false;
  let saveController: SaveController | null = null;
  let savePublishHandle: SavePublishHandle | null = null;
  let historyPanel: HistoryPanelHandle | null = null;
  let closeEditSourceModal: (() => void) | null = null;
  let editSourceOpenSeq = 0;
  let aiPanel: AiPanelHandle | null = null;
  let page: LessonPageHandle | null = null;
  let palette: LessonPaletteHandle | null = null;
  let removeChromeKeys: (() => void) | null = null;
  let printLesson: (() => void) | null = null;

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
    let mediaList: Media[] = media;
    let selectedBlockId: string | null = null;
    let pendingCompositionId: string | null = null;

    renderContextBar(refs, { title: lesson.title || 'Untitled lesson' });
    refs.canvas.replaceChildren();

    const builder = document.createElement('div');
    builder.className = 'lesson-builder';

    const railHost = document.createElement('div');
    railHost.className = 'lesson-builder__rail';

    const pageCol = document.createElement('div');
    pageCol.className = 'lesson-builder__page';

    const chatCol = document.createElement('div');
    chatCol.className = 'lesson-builder__chat';

    const chatStrip = document.createElement('button');
    chatStrip.type = 'button';
    chatStrip.className = 'lesson-builder__chat-strip';
    chatStrip.textContent = 'Chat';
    chatStrip.hidden = true;

    const aiHost = document.createElement('div');

    const publishPanel = document.createElement('div');
    publishPanel.className = 'lesson-editor__publish-panel';
    publishPanel.hidden = true;

    const pageHost = document.createElement('div');

    const compositionConfirm = document.createElement('div');
    compositionConfirm.className = 'lesson-editor__insert-composition-confirm';
    compositionConfirm.hidden = true;

    const compositionStatus = document.createElement('p');
    compositionStatus.className = 'lesson-editor__composition-status';
    compositionStatus.hidden = true;

    pageCol.append(publishPanel, pageHost, compositionConfirm, compositionStatus);
    chatCol.append(chatStrip, aiHost);
    builder.append(railHost, pageCol, chatCol);
    refs.canvas.append(builder);

    function nextId(): string {
      blockCounter += 1;
      return `block_${lesson.id}_${blockCounter}`;
    }

    function assignLesson(next: Lesson): void {
      lesson.title = next.title;
      lesson.blocks = next.blocks;
      if (next.cover) {
        lesson.cover = next.cover;
      } else {
        delete lesson.cover;
      }
    }

    function markDirty(): void {
      saveController?.notifyChange();
    }

    function persistChrome(): void {
      writeBuilderChromePrefs({
        rail: builder.classList.contains('lesson-builder--rail-shelved') ? 'shelved' : 'open',
        chat: builder.classList.contains('lesson-builder--chat-shelved') ? 'shelved' : 'open'
      });
    }

    function setRailShelved(shelved: boolean): void {
      builder.classList.toggle('lesson-builder--rail-shelved', shelved);
      palette?.setShelved(shelved);
      persistChrome();
    }

    function setChatShelved(shelved: boolean): void {
      builder.classList.toggle('lesson-builder--chat-shelved', shelved);
      aiPanel?.setShelved(shelved);
      chatStrip.hidden = !shelved;
      persistChrome();
    }

    function syncAiSelection(): void {
      if (!selectedBlockId) {
        aiPanel?.setSelection({ blockId: null, blockType: null, scope: 'lesson' });
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

    function hideCompositionConfirm(): void {
      pendingCompositionId = null;
      compositionConfirm.hidden = true;
      compositionConfirm.replaceChildren();
    }

    function showCompositionConfirm(compositionId: string): void {
      pendingCompositionId = compositionId;
      compositionConfirm.hidden = false;
      compositionConfirm.replaceChildren();

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'btn btn--secondary lesson-editor__insert-composition-copy';
      copyButton.textContent = 'Copy';

      const linkedButton = document.createElement('button');
      linkedButton.type = 'button';
      linkedButton.className = 'btn btn--secondary lesson-editor__insert-composition-linked';
      linkedButton.textContent = 'Linked';

      copyButton.addEventListener('click', () => {
        const id = pendingCompositionId;
        hideCompositionConfirm();
        if (id) void insertSelectedComposition(id);
      });
      linkedButton.addEventListener('click', () => {
        const id = pendingCompositionId;
        hideCompositionConfirm();
        if (id) void insertLinkedComposition(id);
      });

      compositionConfirm.append(copyButton, linkedButton);
    }

    function queueCompositionFetch(compositionId: string): void {
      ensureCompositionCached({
        compositionId,
        cache: compositionCache,
        inFlight: compositionFetchInFlight,
        onSettled: () => {
          if (!disposed && !isStale()) {
            page?.update(lesson);
          }
        }
      });
    }

    function applyBlocks(nextBlocks: Lesson['blocks']): void {
      lesson.blocks = nextBlocks;
      page?.update(lesson);
      markDirty();
    }

    async function refreshCompositions(): Promise<void> {
      try {
        const data = await apiGet<{ compositions: CompositionSummary[] }>('/api/compositions');
        palette?.updateFamilies(lessonPaletteFamilies(data.compositions));
      } catch {
        palette?.updateFamilies(lessonPaletteFamilies([]));
        setCompositionStatus('Unable to load compositions.');
      }
    }

    async function saveBlockAsComposition(blockId: string): Promise<void> {
      const block = findBlockById(lesson.blocks, blockId);
      if (!block || block.block_type !== 'section' || isLinkedSection(block)) return;
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

    async function insertSelectedComposition(id: string): Promise<void> {
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        const clone = insertCompositionRoot(full.root, nextId);
        const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, clone);
        if (!result.ok) {
          setCompositionStatus(result.message);
          return;
        }
        applyBlocks(result.blocks);
        setCompositionStatus(`Inserted “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to insert composition.');
      }
    }

    async function insertLinkedComposition(id: string): Promise<void> {
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Composition is not available to link.');
          return;
        }
        const stub = createLinkedSectionStub({
          id: nextId(),
          sourceCompositionId: full.id,
          titleHint: full.title
        });
        compositionCache.set(full.id, full);
        const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, stub);
        if (!result.ok) {
          setCompositionStatus(result.message);
          return;
        }
        applyBlocks(result.blocks);
        setCompositionStatus(`Linked “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to link composition.');
      }
    }

    async function detachLinkedSection(blockId: string): Promise<void> {
      const index = lesson.blocks.findIndex((block) => block.id === blockId);
      const block = index >= 0 ? lesson.blocks[index] : undefined;
      if (!block || !isLinkedSection(block)) return;
      try {
        const full = await apiGet<CompositionTemplate>(
          `/api/compositions/${block.content.link.source_composition_id}`
        );
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Unable to detach — composition missing or archived.');
          return;
        }
        const independent = insertCompositionRoot(full.root, nextId);
        const next = [...lesson.blocks];
        next[index] = independent;
        applyBlocks(next);
        setCompositionStatus('Detached composition into this lesson.');
      } catch {
        setCompositionStatus('Unable to detach composition.');
      }
    }

    function openEditSource(compositionId: string): void {
      closeEditSourceModal?.();
      closeEditSourceModal = null;
      const openSeq = ++editSourceOpenSeq;
      void openEditSourceModal({
        compositionId,
        media: mediaList,
        setStatus: setCompositionStatus,
        onSaved: (updated) => {
          compositionCache.set(updated.id, updated);
          setCompositionStatus(`Saved “${updated.title}”.`);
          page?.update(lesson);
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
    }

    function onPaletteInsert(payload: PaletteInsertPayload): void {
      if (payload.kind === 'composition') {
        showCompositionConfirm(payload.id);
        return;
      }
      hideCompositionConfirm();
      const block = createFromInsertMenu(payload.type, nextId());
      const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, block);
      if (!result.ok) {
        setCompositionStatus(result.message);
        return;
      }
      applyBlocks(result.blocks);
    }

    palette = mountLessonPalette(railHost, {
      families: lessonPaletteFamilies([]),
      onInsert: onPaletteInsert,
      onShelved: (shelved) => {
        builder.classList.toggle('lesson-builder--rail-shelved', shelved);
      }
    });

    page = mountLessonPage(pageHost, {
      lesson,
      media: mediaList,
      onChange: (next) => {
        assignLesson(next);
        markDirty();
      },
      onPrint: () => openPrintLesson(lesson),
      onSelect: (blockId) => {
        selectedBlockId = blockId;
        syncAiSelection();
      },
      idFactory: nextId,
      onSaveTemplate: () => {
        void saveLessonAsTemplate();
      },
      onSaveComposition: (blockId) => {
        void saveBlockAsComposition(blockId);
      },
      onEditSource: openEditSource,
      onDetachComposition: (blockId) => {
        void detachLinkedSection(blockId);
      },
      renderLinkedPreview: (compositionId) =>
        buildLinkedPreview(compositionId, compositionCache, queueCompositionFetch)
    });

    printLesson = () => openPrintLesson(lesson);

    aiPanel = mountAiPanel(aiHost, {
      lessonId,
      getSnapshotAt: () => lesson.updated_at,
      onAcceptProposal: (proposal: AiProposal) => {
        const result = applyProposalToLesson(lesson, proposal, nextId);
        if (!result.ok) return result;
        assignLesson(result.lesson);
        page?.update(lesson);
        void saveController?.saveNow({ checkpointReason: 'ai_accepted' });
        return { ok: true };
      },
      onStaleAccept: (apply) => {
        if (
          window.confirm(
            'You edited while the plan was built. Accept replaces the lesson with this plan.'
          )
        ) {
          apply();
        }
      }
    });

    syncAiSelection();

    const prefs = readBuilderChromePrefs();
    if (prefs.rail === 'shelved') setRailShelved(true);
    if (prefs.chat === 'shelved') setChatShelved(true);

    chatStrip.addEventListener('click', () => setChatShelved(false));

    function onWindowKeydown(event: KeyboardEvent): void {
      if (disposed || isTypingTarget(event.target)) return;
      if (event.key === '[') {
        event.preventDefault();
        setRailShelved(!builder.classList.contains('lesson-builder--rail-shelved'));
      } else if (event.key === ']') {
        event.preventDefault();
        setChatShelved(!builder.classList.contains('lesson-builder--chat-shelved'));
      }
    }

    window.addEventListener('keydown', onWindowKeydown);
    removeChromeKeys = () => {
      window.removeEventListener('keydown', onWindowKeydown);
    };

    void refreshCompositions();

    void fetchCurriculum()
      .then((curriculum) => {
        if (disposed || isStale()) return;
        mediaList = curriculum.media;
        page?.update(lesson, mediaList);
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
      blockCounter = lesson.blocks.length;
      page?.update(lesson);
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
      removeChromeKeys?.();
      removeChromeKeys = null;
      closeEditSourceModal?.();
      closeEditSourceModal = null;
      page?.dispose();
      page = null;
      palette?.dispose();
      palette = null;
      historyPanel?.dispose();
      historyPanel = null;
      aiPanel?.dispose();
      aiPanel = null;
      savePublishHandle?.dispose();
      saveController?.dispose();
      printLesson = null;
    },
    openA4Preview() {
      if (disposed) return;
      const print = refs.canvas.querySelector<HTMLButtonElement>('[aria-label="Print"]');
      if (print) {
        print.click();
        return;
      }
      printLesson?.();
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
