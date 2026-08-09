import { createBlockEditor } from '@/blocks/editors';
import {
  BLOCK_GROUPS,
  NEW_BLOCK_LABEL,
  createBlock,
  cloneBlockWithNewIds,
  type NewBlockType
} from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

export interface NestedBlocksEditorOptions {
  blocks: Block[];
  allowedTypes: readonly NewBlockType[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
}

export function createNestedBlocksEditor(options: NestedBlocksEditorOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-editor__nested-list';

  let blocks = [...options.blocks];
  let counter = 0;

  const nextId = () => {
    counter += 1;
    return options.idFactory() + `_n${counter}`;
  };

  function emit(next: Block[]): void {
    blocks = next;
    options.onChange(next);
    render();
  }

  function render(): void {
    root.replaceChildren();

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__nested-row';

      const controls = document.createElement('div');
      controls.className = 'block-editor__nested-controls';

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...blocks];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost';
      down.textContent = '↓';
      down.disabled = index === blocks.length - 1;
      down.addEventListener('click', () => {
        if (index >= blocks.length - 1) return;
        const next = [...blocks];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'btn btn--ghost';
      dup.textContent = 'Duplicate';
      dup.addEventListener('click', () => {
        const clone = cloneBlockWithNewIds(blocks[index]!, nextId);
        const next = [...blocks];
        next.splice(index + 1, 0, clone);
        emit(next);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        emit(blocks.filter((_, i) => i !== index));
      });

      controls.append(up, down, dup, del);

      const editor = createBlockEditor(
        block,
        (updated) => {
          const next = [...blocks];
          next[index] = updated;
          blocks = next;
          options.onChange(next);
        },
        () => blocks[index]!
      );

      row.append(controls, editor);
      root.append(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'block-editor__nested-add-row';

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Add nested block type');
    for (const group of BLOCK_GROUPS) {
      const types = group.types.filter((t) => options.allowedTypes.includes(t));
      if (types.length === 0) continue;
      const og = document.createElement('optgroup');
      og.label = group.label;
      for (const type of types) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = NEW_BLOCK_LABEL[type];
        og.append(opt);
      }
      select.append(og);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--ghost block-editor__nested-add';
    addBtn.textContent = 'Add block';
    addBtn.addEventListener('click', () => {
      const type = select.value as NewBlockType;
      emit([...blocks, createBlock(type, nextId())]);
    });

    addRow.append(select, addBtn);
    root.append(addRow);
  }

  render();
  return root;
}
