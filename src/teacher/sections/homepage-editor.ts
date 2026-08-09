import { ApiClientError } from '@/api/client';
import {
  HOMEPAGE_BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  createFromInsertMenu,
  expandGroupTypesForMenu,
  type InsertMenuValue
} from '@/blocks/create-block';
import {
  emptyMessageForCollection,
  resolveCollection,
  type CollectionResolveContext
} from '@/blocks/collection-resolve';
import {
  createBlockEditor,
  renderBlock,
  renderCollectionBlock,
  type BlockEditorContext
} from '@/blocks/registry';
import type { Block } from '@/schemas/block';
import type { ClassHomepage } from '@/schemas/class';

export const HOMEPAGE_REGIONS = [
  { key: 'announcements', title: 'Announcements', emptyCopy: 'No announcements yet.' },
  { key: 'resources', title: 'Resources', emptyCopy: 'No resources yet.' },
  { key: 'custom', title: 'Custom blocks', emptyCopy: 'No custom blocks yet.' }
] as const satisfies ReadonlyArray<{
  key: keyof ClassHomepage;
  title: string;
  emptyCopy: string;
}>;

export function emptyHomepage(): ClassHomepage {
  return {
    announcements: [],
    resources: [],
    custom: []
  };
}

export function normalizeHomepage(homepage?: ClassHomepage): ClassHomepage {
  return {
    announcements: homepage?.announcements ?? [],
    resources: homepage?.resources ?? [],
    custom: homepage?.custom ?? []
  };
}

function cloneHomepage(homepage: ClassHomepage): ClassHomepage {
  return structuredClone(homepage);
}

function countBlocks(homepage: ClassHomepage): number {
  return homepage.announcements.length + homepage.resources.length + homepage.custom.length;
}

function regionEmptyCopy(text: string): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'class-page__empty';
  empty.textContent = text;
  return empty;
}

function resolveCollectionBlock(
  block: Extract<Block, { block_type: 'collection' }>,
  resolveContext?: CollectionResolveContext
): { links: ReturnType<typeof resolveCollection>; emptyMessage?: string } {
  if (!resolveContext) {
    return { links: [], emptyMessage: 'Preview needs class context.' };
  }
  const links = resolveCollection(block.content, resolveContext, { publishedOnly: false });
  const emptyMessage = emptyMessageForCollection(block.content.source, {
    hasCurrentUnit: Boolean(resolveContext.currentUnitId),
    linkCount: links.length
  });
  return { links, emptyMessage };
}

function renderHomepageBlock(
  block: Block,
  resolveContext?: CollectionResolveContext
): HTMLElement {
  if (block.block_type === 'collection') {
    return renderCollectionBlock(block, 'teacher', resolveCollectionBlock(block, resolveContext));
  }
  return renderBlock(block, 'teacher');
}

export function renderHomepageRegionsView(
  container: HTMLElement,
  homepage: ClassHomepage,
  resolveContext?: CollectionResolveContext
): void {
  container.replaceChildren();
  const normalized = normalizeHomepage(homepage);

  for (const region of HOMEPAGE_REGIONS) {
    const section = document.createElement('section');
    section.className = 'class-page__section homepage-regions__section';
    section.dataset.homepageRegion = region.key;

    const heading = document.createElement('h2');
    heading.className = 'class-page__heading';
    heading.textContent = region.title;
    section.append(heading);

    const blocks = normalized[region.key];
    if (blocks.length === 0) {
      section.append(regionEmptyCopy(region.emptyCopy));
    } else {
      const list = document.createElement('div');
      list.className = 'homepage-regions__blocks';
      for (const block of blocks) {
        list.append(renderHomepageBlock(block, resolveContext));
      }
      section.append(list);
    }

    container.append(section);
  }
}

export interface HomepageEditorHandle {
  destroy(): void;
}

export function mountHomepageEditor(
  container: HTMLElement,
  initial: ClassHomepage,
  options: {
    onSave: (homepage: ClassHomepage) => Promise<void>;
    onCancel: () => void;
    resolveContext?: CollectionResolveContext;
  }
): HomepageEditorHandle {
  const homepage = cloneHomepage(normalizeHomepage(initial));
  let blockCounter = countBlocks(homepage);
  let destroyed = false;

  const editorContext: BlockEditorContext = {
    resolveCollection: (block) => resolveCollectionBlock(block, options.resolveContext)
  };

  container.replaceChildren();

  const root = document.createElement('div');
  root.className = 'homepage-editor';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'homepage-editor__error class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const toolbar = document.createElement('div');
  toolbar.className = 'homepage-editor__toolbar';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--primary homepage-editor__save';
  saveButton.textContent = 'Save homepage';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn--secondary homepage-editor__cancel';
  cancelButton.textContent = 'Cancel';

  toolbar.append(saveButton, cancelButton);

  const regionsContainer = document.createElement('div');
  regionsContainer.className = 'homepage-editor__regions';

  root.append(errorBanner, toolbar, regionsContainer);
  container.append(root);

  function renderRegionBlocks(
    regionKey: keyof ClassHomepage,
    blocksContainer: HTMLElement,
    blocks: Block[]
  ): void {
    blocksContainer.replaceChildren();

    if (blocks.length === 0) {
      const region = HOMEPAGE_REGIONS.find((entry) => entry.key === regionKey);
      blocksContainer.append(regionEmptyCopy(region?.emptyCopy ?? 'No blocks yet.'));
      return;
    }

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'homepage-editor__block-row';

      const controls = document.createElement('div');
      controls.className = 'homepage-editor__block-controls';

      const upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'btn btn--ghost homepage-editor__reorder';
      upButton.textContent = '↑';
      upButton.setAttribute('aria-label', `Move block ${index + 1} up`);
      upButton.disabled = index === 0;
      upButton.addEventListener('click', () => moveBlock(regionKey, index, -1));

      const downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'btn btn--ghost homepage-editor__reorder';
      downButton.textContent = '↓';
      downButton.setAttribute('aria-label', `Move block ${index + 1} down`);
      downButton.disabled = index === blocks.length - 1;
      downButton.addEventListener('click', () => moveBlock(regionKey, index, 1));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn--ghost homepage-editor__delete';
      deleteButton.textContent = 'Delete';
      deleteButton.setAttribute('aria-label', `Delete block ${index + 1}`);
      deleteButton.addEventListener('click', () => deleteBlock(regionKey, index));

      controls.append(upButton, downButton, deleteButton);

      const editor = createBlockEditor(
        block,
        (updated) => {
          homepage[regionKey][index] = updated;
        },
        () => homepage[regionKey][index]!,
        editorContext
      );

      row.append(controls, editor);
      blocksContainer.append(row);
    });
  }

  function renderRegions(): void {
    regionsContainer.replaceChildren();

    for (const region of HOMEPAGE_REGIONS) {
      const regionSection = document.createElement('section');
      regionSection.className = 'homepage-editor__region';
      regionSection.dataset.homepageRegion = region.key;

      const header = document.createElement('div');
      header.className = 'homepage-editor__region-header';

      const heading = document.createElement('h2');
      heading.className = 'class-page__heading';
      heading.textContent = region.title;

      header.append(heading);

      const addBlockBar = document.createElement('div');
      addBlockBar.className = 'homepage-editor__add-block';

      const addSelectId = `homepage-add-block-${region.key}`;
      const addLabel = document.createElement('label');
      addLabel.className = 'homepage-editor__add-block-label';
      addLabel.htmlFor = addSelectId;
      addLabel.textContent = 'Add block';

      const addSelect = document.createElement('select');
      addSelect.id = addSelectId;
      addSelect.className = 'homepage-editor__add-block-select';
      for (const group of HOMEPAGE_BLOCK_GROUPS) {
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
      addButton.className = 'btn btn--secondary homepage-editor__add-block-button';
      addButton.textContent = 'Add block';
      addButton.addEventListener('click', () => {
        addBlock(region.key, addSelect.value as InsertMenuValue);
      });

      addBlockBar.append(addLabel, addSelect, addButton);
      header.append(addBlockBar);

      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'homepage-editor__blocks';

      renderRegionBlocks(region.key, blocksContainer, homepage[region.key]);

      regionSection.append(header, blocksContainer);
      regionsContainer.append(regionSection);
    }
  }

  function moveBlock(regionKey: keyof ClassHomepage, index: number, direction: -1 | 1): void {
    const blocks = homepage[regionKey];
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const temp = blocks[index]!;
    blocks[index] = blocks[target]!;
    blocks[target] = temp;
    renderRegions();
  }

  function deleteBlock(regionKey: keyof ClassHomepage, index: number): void {
    homepage[regionKey].splice(index, 1);
    renderRegions();
  }

  function addBlock(regionKey: keyof ClassHomepage, type: InsertMenuValue): void {
    blockCounter += 1;
    const id = `block_homepage_${regionKey}_${blockCounter}`;
    homepage[regionKey].push(createFromInsertMenu(type, id));
    renderRegions();
  }

  saveButton.addEventListener('click', () => {
    if (destroyed) return;
    errorBanner.hidden = true;
    errorBanner.textContent = '';
    saveButton.disabled = true;
    cancelButton.disabled = true;

    void options
      .onSave(cloneHomepage(homepage))
      .catch((error: unknown) => {
        const message =
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unable to save homepage.';
        errorBanner.hidden = false;
        errorBanner.textContent = message;
      })
      .finally(() => {
        saveButton.disabled = false;
        cancelButton.disabled = false;
      });
  });

  cancelButton.addEventListener('click', () => {
    if (destroyed) return;
    options.onCancel();
  });

  renderRegions();

  return {
    destroy() {
      destroyed = true;
      container.replaceChildren();
    }
  };
}
