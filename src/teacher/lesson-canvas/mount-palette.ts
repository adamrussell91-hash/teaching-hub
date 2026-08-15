import type { InsertMenuValue } from '@/blocks/create-block';
import type { PaletteCard, PaletteFamily } from '@/teacher/lesson-canvas/palette-catalog';
import { readBuilderChromePrefs, writeBuilderChromePrefs } from '@/teacher/lesson-canvas/prefs';

export const PALETTE_DND_MIME = 'application/x-teaching-hub-block';

export type PaletteInsertPayload =
  | { kind: 'block'; type: InsertMenuValue }
  | { kind: 'composition'; id: string };

export type MountLessonPaletteOptions = {
  families: PaletteFamily[];
  onInsert: (payload: PaletteInsertPayload) => void;
  onDragStart?: () => void;
  onShelved?: (shelved: boolean) => void;
};

export type LessonPaletteHandle = {
  setShelved(shelved: boolean): void;
  updateFamilies(families: PaletteFamily[]): void;
  dispose(): void;
};

function payloadForCard(card: PaletteCard): PaletteInsertPayload {
  return card.kind === 'block'
    ? { kind: 'block', type: card.type }
    : { kind: 'composition', id: card.id };
}

function renderCard(card: PaletteCard): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'lesson-palette__card';
  if (card.kind === 'block') {
    el.dataset.blockType = card.type;
  } else {
    el.dataset.compositionId = card.id;
  }

  const icon = document.createElement(card.kind === 'block' ? 'img' : 'span');
  icon.className = 'lesson-palette__card-icon';
  if (card.kind === 'block' && icon instanceof HTMLImageElement) {
    icon.src = card.iconSrc;
    icon.alt = '';
    icon.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'lesson-palette__card-icon';
      fallback.textContent = card.title.slice(0, 1);
      icon.replaceWith(fallback);
    };
  } else {
    icon.textContent = card.title.slice(0, 1);
  }

  const title = document.createElement('span');
  title.className = 'lesson-palette__card-title';
  title.textContent = card.title;

  const body = document.createElement('span');
  body.className = 'lesson-palette__card-copy';
  body.append(title);

  if (card.kind === 'block') {
    const desc = document.createElement('span');
    desc.className = 'lesson-palette__card-desc';
    desc.textContent = card.description;
    body.append(desc);
  }

  el.append(icon, body);
  return el;
}

export function mountLessonPalette(
  host: HTMLElement,
  options: MountLessonPaletteOptions
): LessonPaletteHandle {
  host.classList.add('lesson-palette');

  const rail = document.createElement('div');
  rail.className = 'lesson-palette__rail';

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'lesson-palette__tab';
  tab.textContent = 'Blocks';

  let openId: string | null = null;
  let flyout: HTMLElement | null = null;

  function persistShelf(shelved: boolean): void {
    const prefs = readBuilderChromePrefs();
    writeBuilderChromePrefs({ ...prefs, rail: shelved ? 'shelved' : 'open' });
  }

  function closeFlyout(): void {
    flyout?.remove();
    flyout = null;
    openId = null;
  }

  function bindCard(el: HTMLButtonElement, card: PaletteCard): void {
    const payload = payloadForCard(card);
    el.draggable = true;
    el.addEventListener('click', () => {
      options.onInsert(payload);
    });
    el.addEventListener('dragstart', (event) => {
      const dt = event.dataTransfer;
      if (dt) {
        dt.setData(PALETTE_DND_MIME, JSON.stringify(payload));
        dt.effectAllowed = 'copy';
      }
      host.dataset.dragging = 'true';
      flyout?.classList.add('lesson-palette__flyout--receded');
      options.onDragStart?.();
    });
    el.addEventListener('dragend', () => {
      delete host.dataset.dragging;
      flyout?.classList.remove('lesson-palette__flyout--receded');
    });
  }

  function openFlyout(family: PaletteFamily): void {
    closeFlyout();
    openId = family.id;
    flyout = document.createElement('div');
    flyout.className = 'lesson-palette__flyout';
    flyout.setAttribute('role', 'listbox');
    flyout.setAttribute('aria-label', family.id);

    for (const card of family.cards) {
      const el = renderCard(card);
      bindCard(el, card);
      flyout.append(el);
    }

    host.append(flyout);
  }

  function setShelved(shelved: boolean): void {
    host.classList.toggle('lesson-palette--shelved', shelved);
    if (shelved) closeFlyout();
    persistShelf(shelved);
    options.onShelved?.(shelved);
  }

  function renderRail(families: PaletteFamily[]): void {
    rail.replaceChildren();
    for (const family of families) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lesson-palette__family';
      btn.dataset.family = family.id;

      const glyph = document.createElement('span');
      glyph.className = 'lesson-palette__family-icon';
      glyph.textContent = family.id.slice(0, 1);

      const label = document.createElement('span');
      label.className = 'lesson-palette__family-label';
      label.textContent = family.id;

      btn.append(glyph, label);

      if (family.disabled) {
        btn.disabled = true;
        btn.style.pointerEvents = 'none';
      } else {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (openId === family.id) closeFlyout();
          else openFlyout(family);
        });
      }

      rail.append(btn);
    }
  }

  renderRail(options.families);

  tab.addEventListener('click', (event) => {
    event.stopPropagation();
    setShelved(false);
  });

  function onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && !host.contains(target)) closeFlyout();
  }

  function onDocumentKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeFlyout();
  }

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKey);

  host.append(rail, tab);

  return {
    setShelved,
    updateFamilies(families: PaletteFamily[]) {
      closeFlyout();
      renderRail(families);
    },
    dispose() {
      closeFlyout();
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKey);
      host.replaceChildren();
      host.classList.remove('lesson-palette', 'lesson-palette--shelved');
      delete host.dataset.dragging;
    }
  };
}
