import type { Cover, Media } from '@/schemas';
import { coverAltText, resolveCoverUrl } from '@/schemas';
import { mountCoverPicker } from '@/teacher/cover-picker';

export interface EntityBannerOptions {
  cover?: Cover | null;
  media: ReadonlyArray<Media>;
  title: string;
  eyebrow?: string;
  entityId: string;
  editable?: boolean;
  onSave?: (cover: Cover | null) => void | Promise<void>;
}

export interface EntityBannerHandle {
  dispose: () => void;
}

/** Deterministic hue (0–359) from an entity id for no-cover banners. */
export function bannerHueFromEntityId(id: string): number {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
}

export function gradientForEntityId(id: string): string {
  const hue = bannerHueFromEntityId(id);
  return `linear-gradient(135deg, hsl(${hue} 32% 26%) 0%, hsl(${(hue + 38) % 360} 38% 17%) 100%)`;
}

const SCRIM_GRADIENT =
  'linear-gradient(to top, rgba(10,21,54,.82) 0%, rgba(10,21,54,.35) 45%, transparent 100%)';

/**
 * Read-first entity cover banner (class page hero). Edit controls live in a
 * dialog via `mountCoverPicker` — not inline in the reading view.
 */
export function renderEntityBanner(
  host: HTMLElement,
  options: EntityBannerOptions
): EntityBannerHandle {
  let current: Cover | null = options.cover ?? null;
  const media = options.media;
  let dialog: HTMLDialogElement | null = null;
  let pickerDispose: (() => void) | null = null;
  let dialogClosed = true;

  const root = document.createElement('div');
  root.className = 'entity-banner';
  root.style.aspectRatio = '16 / 5';
  root.style.borderRadius = 'var(--radius-xl)';
  root.style.overflow = 'hidden';
  root.style.position = 'relative';

  const paint = (): void => {
    root.replaceChildren();

    const url = resolveCoverUrl(current ?? undefined, media);
    if (url) {
      const img = document.createElement('img');
      img.className = 'entity-banner__image';
      img.src = url;
      img.alt = coverAltText(current, options.title);
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      root.append(img);
    } else {
      // setAttribute keeps hsl() gradients that happy-dom's style setter drops
      const fallback = document.createElement('div');
      fallback.className = 'entity-banner__fallback';
      fallback.setAttribute(
        'style',
        `position:absolute;inset:0;background:${gradientForEntityId(options.entityId)}`
      );
      root.append(fallback);
    }

    const scrim = document.createElement('div');
    scrim.className = 'entity-banner__scrim';
    scrim.setAttribute(
      'style',
      [
        `background:${SCRIM_GRADIENT}`,
        'position:absolute',
        'inset:0',
        'display:flex',
        'flex-direction:column',
        'justify-content:flex-end',
        'padding:var(--space-4) var(--space-5)',
        'pointer-events:none'
      ].join(';')
    );

    if (options.eyebrow) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'entity-banner__eyebrow';
      eyebrow.textContent = options.eyebrow;
      scrim.append(eyebrow);
    }

    const title = document.createElement('h1');
    title.className = 'entity-banner__title';
    title.textContent = options.title;
    scrim.append(title);

    root.append(scrim);

    if (options.editable) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'entity-banner__edit btn btn--secondary';
      editBtn.textContent = 'Change cover';
      editBtn.addEventListener('click', () => {
        openCoverDialog();
      });
      root.append(editBtn);
    }
  };

  const closeCoverDialog = (): void => {
    if (dialogClosed) return;
    dialogClosed = true;
    pickerDispose?.();
    pickerDispose = null;
    if (dialog) {
      const el = dialog;
      dialog = null;
      if (el.open) el.close();
      el.remove();
    }
  };

  const openCoverDialog = (): void => {
    closeCoverDialog();
    dialogClosed = false;

    const next = document.createElement('dialog');
    next.className = 'entity-banner__dialog';
    next.setAttribute('aria-label', 'Change cover');

    const heading = document.createElement('h2');
    heading.className = 'entity-banner__dialog-title';
    heading.textContent = 'Change cover';

    const pickerHost = document.createElement('div');
    pickerHost.className = 'entity-banner__dialog-picker';

    const footer = document.createElement('div');
    footer.className = 'entity-banner__dialog-footer';

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn--ghost';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      closeCoverDialog();
    });
    footer.append(doneBtn);

    next.append(heading, pickerHost, footer);
    document.body.append(next);
    dialog = next;

    const picker = mountCoverPicker(pickerHost, {
      cover: current,
      media,
      titleFallback: options.title,
      editable: true,
      onSave: async (cover) => {
        await options.onSave?.(cover);
        current = cover;
        paint();
        closeCoverDialog();
      }
    });
    pickerDispose = picker.dispose;

    next.addEventListener('close', () => {
      closeCoverDialog();
    });

    next.showModal();
  };

  paint();
  host.replaceChildren(root);

  return {
    dispose: () => {
      closeCoverDialog();
      host.replaceChildren();
    }
  };
}
