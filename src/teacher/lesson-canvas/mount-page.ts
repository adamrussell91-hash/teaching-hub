import { isLinkedSection } from '@/blocks/composition-link';
import {
  createFromInsertMenu,
  cloneBlockWithNewIds,
  type InsertMenuValue
} from '@/blocks/create-block';
import {
  createBlockEditor,
  createVisibilitySelect,
  type BlockEditorContext
} from '@/blocks/editors';
import { findBlockById } from '@/blocks/find-block';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import { mountCoverPicker, type CoverPickerHandle } from '@/teacher/cover-picker';
import { deleteBlocksById, insertAt, type DropRootMode } from '@/teacher/lesson-canvas/drop';
import { isTextLike } from '@/teacher/lesson-canvas/kinds';

const DND_MIME = 'application/x-teaching-hub-block';

export type MountBlockCanvasOptions = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
  media?: Media[];
  editorContext?: BlockEditorContext;
  renderPreview?: (block: Block) => HTMLElement;
  allowCollectionAtRoot?: boolean;
  heading?: string;
  onSelect?: (blockId: string | null) => void;
  onSaveComposition?: (blockId: string) => void;
  onEditSource?: (compositionId: string) => void;
  onDetachComposition?: (blockId: string) => void;
  onCompositionDrop?: (id: string) => void;
  renderLinkedPreview?: (compositionId: string) => HTMLElement;
};

export type BlockCanvasHandle = {
  update(blocks: Block[], nextMedia?: Media[]): void;
  insertType(type: InsertMenuValue): void;
  dispose(): void;
};

export type MountLessonPageOptions = {
  lesson: Lesson;
  media?: Media[];
  onChange: (lesson: Lesson) => void;
  onPrint: () => void;
  onSelect?: (blockId: string | null) => void;
  idFactory: () => string;
  onSaveTemplate?: () => void;
  onExport?: () => void;
  onSaveComposition?: (blockId: string) => void;
  onEditSource?: (compositionId: string) => void;
  onDetachComposition?: (blockId: string) => void;
  onCompositionDrop?: (id: string) => void;
  renderLinkedPreview?: (compositionId: string) => HTMLElement;
};

export type LessonPageHandle = {
  update(lesson: Lesson, nextMedia?: Media[]): void;
  dispose(): void;
};

function replaceBlockInTree(blocks: Block[], updated: Block): Block[] {
  return blocks.map((block) => {
    if (block.id === updated.id) return updated;
    if (block.block_type === 'section') {
      return {
        ...block,
        content: { ...block.content, blocks: replaceBlockInTree(block.content.blocks as Block[], updated) }
      } as Block;
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: replaceBlockInTree(col.blocks as Block[], updated)
          }))
        }
      } as Block;
    }
    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: block.content.tabs.map((tab) => ({
            ...tab,
            blocks: replaceBlockInTree(tab.blocks as Block[], updated)
          }))
        }
      } as Block;
    }
    return block;
  });
}

function readDropPayload(
  event: Event
): { kind: 'block'; type: string } | { kind: 'composition'; id: string } | null {
  const dt = (event as DragEvent).dataTransfer;
  const raw = dt?.getData(DND_MIME) ?? '';
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { kind?: unknown; type?: unknown; id?: unknown };
    if (record.kind === 'composition' && typeof record.id === 'string') {
      return { kind: 'composition', id: record.id };
    }
    if (typeof record.type === 'string') {
      return { kind: 'block', type: record.type };
    }
    return null;
  } catch {
    return null;
  }
}

function printIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="currentColor" d="M7 3h10v4H7V3zm12 6H5a3 3 0 0 0-3 3v5h4v4h12v-4h4v-5a3 3 0 0 0-3-3zm-3 10H8v-4h8v4z"/>';
  return svg;
}

export function mountBlockCanvas(
  host: HTMLElement,
  options: MountBlockCanvasOptions
): BlockCanvasHandle {
  let blocks = options.blocks;
  let selectedId: string | null = null;
  let media = options.media ?? [];
  const rootMode: DropRootMode = options.allowCollectionAtRoot ? 'page' : 'lesson';

  const root = document.createElement('div');
  root.className = 'lesson-page lesson-page--blocks';
  host.append(root);

  function emit(next: Block[], rerender = true): void {
    blocks = next;
    options.onChange(next);
    if (rerender) render();
  }

  function select(blockId: string | null): void {
    selectedId = blockId;
    options.onSelect?.(blockId);
    render();
  }

  function onBlockChange(updated: Block): void {
    emit(replaceBlockInTree(blocks, updated));
  }

  function latestBlock(id: string, fallback: Block): () => Block {
    return () => findBlockById(blocks, id) ?? fallback;
  }

  function editorCtx(): BlockEditorContext {
    return { ...options.editorContext, media };
  }

  function setHint(message: string): void {
    const hint = root.querySelector('.lesson-page__hint');
    if (hint) hint.textContent = message;
  }

  function handleGapDragOver(event: Event): void {
    event.preventDefault();
    const dt = (event as DragEvent).dataTransfer;
    if (dt) dt.dropEffect = 'copy';
  }

  function handleGapDrop(event: Event, index: number): void {
    event.preventDefault();
    const payload = readDropPayload(event);
    if (!payload) return;
    if (payload.kind === 'composition') {
      options.onCompositionDrop?.(payload.id);
      return;
    }
    const block = createFromInsertMenu(payload.type as InsertMenuValue, options.idFactory());
    const result = insertAt(blocks, { kind: 'root' }, index, block, { rootMode });
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setHint('');
    emit(result.blocks);
    select(block.id);
  }

  function createGap(index: number): HTMLElement {
    const gap = document.createElement('div');
    gap.className = 'lesson-page__gap';
    gap.dataset.index = String(index);
    gap.style.pointerEvents = 'auto';
    gap.addEventListener('dragover', handleGapDragOver);
    gap.addEventListener('drop', (event) => handleGapDrop(event, index));
    return gap;
  }

  function createToolbar(block: Block): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'lesson-page__toolbar';

    const visibility = createVisibilitySelect(block, onBlockChange, latestBlock(block.id, block));

    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'btn btn--ghost';
    duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', (event) => {
      event.stopPropagation();
      const clone = cloneBlockWithNewIds(block, options.idFactory);
      const index = blocks.findIndex((row) => row.id === block.id);
      const at = index >= 0 ? index + 1 : blocks.length;
      const result = insertAt(blocks, { kind: 'root' }, at, clone, { rootMode });
      if (result.ok) emit(result.blocks);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost';
    remove.textContent = 'Delete';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedId = null;
      options.onSelect?.(null);
      emit(deleteBlocksById(blocks, [block.id]));
    });

    bar.append(visibility, duplicate, remove);

    if (block.block_type === 'section' && !isLinkedSection(block) && options.onSaveComposition) {
      const saveComposition = document.createElement('button');
      saveComposition.type = 'button';
      saveComposition.className = 'btn btn--ghost lesson-editor__save-composition';
      saveComposition.textContent = 'Save as composition';
      saveComposition.setAttribute('aria-label', 'Save as composition');
      saveComposition.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onSaveComposition?.(block.id);
      });
      bar.append(saveComposition);
    }

    return bar;
  }

  function createLinkedChrome(block: Block): HTMLElement {
    const chrome = document.createElement('div');
    chrome.className = 'lesson-page__linked-chrome';

    const badge = document.createElement('span');
    badge.className = 'lesson-editor__linked-badge';
    badge.textContent = 'Linked';
    chrome.append(badge);

    if (isLinkedSection(block)) {
      const compositionId = block.content.link.source_composition_id;

      const editSource = document.createElement('button');
      editSource.type = 'button';
      editSource.className = 'btn btn--ghost lesson-editor__edit-source';
      editSource.textContent = 'Edit Source';
      editSource.setAttribute('aria-label', 'Edit source');
      editSource.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onEditSource?.(compositionId);
      });

      const detach = document.createElement('button');
      detach.type = 'button';
      detach.className = 'btn btn--ghost lesson-editor__detach-composition';
      detach.textContent = 'Detach';
      detach.setAttribute('aria-label', 'Detach linked composition');
      detach.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onDetachComposition?.(block.id);
      });

      chrome.append(editSource, detach);
    }

    return chrome;
  }

  function preview(block: Block): HTMLElement {
    return options.renderPreview?.(block) ?? renderBlock(block, 'teacher');
  }

  function render(): void {
    root.replaceChildren();

    if (options.heading) {
      const heading = document.createElement('h2');
      heading.className = 'lesson-page__heading class-page__heading';
      heading.textContent = options.heading;
      root.append(heading);
    }

    const hint = document.createElement('p');
    hint.className = 'lesson-page__hint';
    hint.setAttribute('role', 'status');
    root.append(hint);

    const list = document.createElement('div');
    list.className = 'lesson-page__blocks';

    blocks.forEach((block, index) => {
      list.append(createGap(index));

      const row = document.createElement('div');
      row.className = 'lesson-page__block';
      row.dataset.blockId = block.id;
      row.dataset.blockType = block.block_type;
      if (selectedId === block.id) row.classList.add('lesson-page__block--selected');

      if (isLinkedSection(block)) {
        row.append(createLinkedChrome(block));
        row.append(
          options.renderLinkedPreview?.(block.content.link.source_composition_id) ?? preview(block)
        );
        row.addEventListener('click', (event) => {
          if ((event.target as HTMLElement | null)?.closest('button')) return;
          selectedId = block.id;
          options.onSelect?.(block.id);
        });
      } else if (isTextLike(block.block_type)) {
        if (selectedId === block.id) {
          const editor = createBlockEditor(block, onBlockChange, latestBlock(block.id, block), editorCtx());
          editor.querySelectorAll('.block-editor__move-up, .block-editor__move-down').forEach((el) => el.remove());
          row.append(editor);
          row.append(createToolbar(block));
        } else {
          row.append(preview(block));
        }
        row.addEventListener('click', () => select(block.id));
      } else {
        row.append(preview(block));
        row.addEventListener('click', () => select(block.id));
        if (selectedId === block.id) {
          row.append(createToolbar(block));
        }
      }

      list.append(row);
    });

    list.append(createGap(blocks.length));
    root.append(list);

    const selected = selectedId ? findBlockById(blocks, selectedId) : null;
    if (selected && !isTextLike(selected.block_type) && !isLinkedSection(selected)) {
      const inspector = document.createElement('div');
      inspector.className = 'lesson-page__inspector';
      const editor = createBlockEditor(
        selected,
        onBlockChange,
        latestBlock(selected.id, selected),
        editorCtx()
      );
      editor.querySelectorAll('.block-editor__move-up, .block-editor__move-down').forEach((el) => el.remove());
      inspector.append(editor);
      root.append(inspector);
    }
  }

  render();

  return {
    update(next: Block[], nextMedia?: Media[]) {
      blocks = next;
      if (nextMedia) media = nextMedia;
      if (selectedId && !findBlockById(blocks, selectedId)) selectedId = null;
      render();
    },
    insertType(type: InsertMenuValue) {
      const block = createFromInsertMenu(type, options.idFactory());
      const result = insertAt(blocks, { kind: 'root' }, blocks.length, block, { rootMode });
      if (!result.ok) {
        setHint(result.message);
        return;
      }
      setHint('');
      emit(result.blocks);
      select(block.id);
    },
    dispose() {
      root.remove();
    }
  };
}

export function mountLessonPage(host: HTMLElement, options: MountLessonPageOptions): LessonPageHandle {
  let lesson = options.lesson;
  let coverHandle: CoverPickerHandle | null = null;
  let media = options.media ?? [];

  const root = document.createElement('div');
  root.className = 'lesson-page';
  host.append(root);

  function emitLesson(next: Lesson, rerenderChrome = false): void {
    lesson = next;
    options.onChange(next);
    if (rerenderChrome) renderChrome();
  }

  const moreWrap = document.createElement('div');
  moreWrap.className = 'lesson-page__more';

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'btn btn--ghost lesson-page__more-btn';
  more.setAttribute('aria-label', 'Page menu');
  more.textContent = '⋯';

  const menu = document.createElement('div');
  menu.className = 'lesson-page__menu';
  menu.hidden = true;

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn--ghost';
  save.textContent = 'Save as lesson template';
  save.addEventListener('click', () => {
    options.onSaveTemplate?.();
  });

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn--ghost';
  exportBtn.textContent = 'Export JSON';
  exportBtn.addEventListener('click', () => {
    options.onExport?.();
  });
  menu.append(exportBtn, save);

  more.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
  });
  moreWrap.append(more, menu);

  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'lesson-page__print';
  print.setAttribute('aria-label', 'Print');
  print.append(printIcon());
  print.addEventListener('click', () => options.onPrint());

  const chrome = document.createElement('div');
  chrome.className = 'lesson-page__chrome';
  chrome.append(moreWrap, print);

  const coverHost = document.createElement('div');
  coverHost.className = 'lesson-page__cover';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'lesson-page__title';
  title.value = lesson.title;
  title.setAttribute('aria-label', 'Lesson title');
  title.addEventListener('input', () => {
    emitLesson({ ...lesson, title: title.value });
  });

  const canvasHost = document.createElement('div');
  canvasHost.className = 'lesson-page__canvas';

  root.append(chrome, coverHost, title, canvasHost);

  function mountCover(): void {
    coverHandle?.dispose();
    coverHandle = mountCoverPicker(coverHost, {
      cover: lesson.cover ?? null,
      media,
      titleFallback: lesson.title,
      compact: true,
      onSave: (cover) => {
        emitLesson({ ...lesson, ...(cover ? { cover } : { cover: undefined }) });
      }
    });
  }

  function renderChrome(): void {
    title.value = lesson.title;
    mountCover();
  }

  const canvas = mountBlockCanvas(canvasHost, {
    blocks: lesson.blocks,
    media,
    onChange: (blocks) => {
      emitLesson({ ...lesson, blocks });
    },
    onSelect: options.onSelect,
    idFactory: options.idFactory,
    onSaveComposition: options.onSaveComposition,
    onEditSource: options.onEditSource,
    onDetachComposition: options.onDetachComposition,
    onCompositionDrop: options.onCompositionDrop,
    renderLinkedPreview: options.renderLinkedPreview
  });

  mountCover();

  return {
    update(next: Lesson, nextMedia?: Media[]) {
      lesson = next;
      if (nextMedia) media = nextMedia;
      renderChrome();
      canvas.update(lesson.blocks, media);
    },
    dispose() {
      canvas.dispose();
      coverHandle?.dispose();
      coverHandle = null;
      root.remove();
    }
  };
}
