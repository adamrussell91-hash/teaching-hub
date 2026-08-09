import {
  COLUMN_PRESETS,
  remapColumnsPreset,
  type ColumnPreset
} from '@/blocks/column-presets';
import { COLUMN_CHILD_TYPES, SECTION_CHILD_TYPES } from '@/blocks/create-block';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import type { Block } from '@/schemas/block';

export function createSpacerEditor(
  block: Extract<Block, { block_type: 'spacer' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'spacer' }>>,
  getLatest: () => Extract<Block, { block_type: 'spacer' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const select = document.createElement('select');
  select.className = 'block-editor__spacer-size';
  select.setAttribute('aria-label', 'Spacer size');
  for (const size of ['small', 'medium', 'large'] as const) {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size[0]!.toUpperCase() + size.slice(1);
    select.append(opt);
  }
  select.value = block.content.size;
  select.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      content: { size: select.value as 'small' | 'medium' | 'large' }
    });
  });

  const preview = document.createElement('div');
  preview.className = `block-spacer block-spacer--${block.content.size}`;
  preview.setAttribute('aria-hidden', 'true');

  fields.append(select, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createSectionEditor(
  block: Extract<Block, { block_type: 'section' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'section' }>>,
  getLatest: () => Extract<Block, { block_type: 'section' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__section-title';
  title.value = block.content.title;
  title.placeholder = 'Section title';
  title.setAttribute('aria-label', 'Section title');
  title.addEventListener('input', () => {
    onChange({
      ...getLatest(),
      content: { ...getLatest().content, title: title.value }
    });
  });

  const collapse = document.createElement('label');
  const collapseInput = document.createElement('input');
  collapseInput.type = 'checkbox';
  collapseInput.checked = Boolean(block.content.collapsed_in_editor);
  collapseInput.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      content: {
        ...getLatest().content,
        collapsed_in_editor: collapseInput.checked
      }
    });
    children.hidden = collapseInput.checked;
  });
  collapse.append(collapseInput, document.createTextNode(' Collapse in editor'));

  const children = createNestedBlocksEditor({
    blocks: block.content.blocks,
    allowedTypes: SECTION_CHILD_TYPES,
    idFactory: () => `${getLatest().id}_child`,
    onChange: (nextBlocks) => {
      onChange({
        ...getLatest(),
        content: {
          ...getLatest().content,
          blocks: nextBlocks as Extract<Block, { block_type: 'section' }>['content']['blocks']
        }
      });
    }
  });
  children.classList.add('block-editor__section-children');
  children.hidden = Boolean(block.content.collapsed_in_editor);

  fields.append(title, collapse, children);
  return editorShell(block, onChange, fields, getLatest);
}

export function createColumnsEditor(
  block: Extract<Block, { block_type: 'columns' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'columns' }>>,
  getLatest: () => Extract<Block, { block_type: 'columns' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__columns';

  const preset = document.createElement('select');
  preset.className = 'block-editor__columns-preset';
  preset.setAttribute('aria-label', 'Column layout');
  for (const value of COLUMN_PRESETS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    preset.append(opt);
  }
  preset.value = block.content.preset;
  preset.addEventListener('change', () => {
    const current = getLatest();
    const nextPreset = preset.value as ColumnPreset;
    onChange({
      ...current,
      content: {
        preset: nextPreset,
        columns: remapColumnsPreset(
          current.content.columns,
          nextPreset
        ) as Extract<Block, { block_type: 'columns' }>['content']['columns']
      }
    });
    rebuildPanes();
  });

  const panes = document.createElement('div');
  panes.className = 'block-editor__column-panes';

  function rebuildPanes(): void {
    const current = getLatest();
    panes.replaceChildren();
    panes.style.gridTemplateColumns = current.content.columns
      .map((col) => `${col.width}fr`)
      .join(' ');

    current.content.columns.forEach((col, colIndex) => {
      const pane = document.createElement('div');
      pane.className = 'block-editor__column-pane';
      const label = document.createElement('p');
      label.className = 'block-editor__hint';
      label.textContent = `Column ${colIndex + 1} (${col.width}/12)`;
      const nested = createNestedBlocksEditor({
        blocks: col.blocks,
        allowedTypes: COLUMN_CHILD_TYPES,
        idFactory: () => `${getLatest().id}_c${colIndex}`,
        onChange: (nextBlocks) => {
          const latest = getLatest();
          const columns = latest.content.columns.map((c, i) =>
            i === colIndex
              ? {
                  ...c,
                  blocks: nextBlocks as (typeof latest.content.columns)[number]['blocks']
                }
              : c
          );
          onChange({
            ...latest,
            content: { ...latest.content, columns }
          });
        }
      });
      pane.append(label, nested);
      panes.append(pane);
    });
  }

  rebuildPanes();
  fields.append(preset, panes);
  return editorShell(block, onChange, fields, getLatest);
}
