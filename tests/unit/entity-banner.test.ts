import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cover, Media } from '@/schemas';
import {
  bannerHueFromEntityId,
  gradientForEntityId,
  renderEntityBanner
} from '@/teacher/entity-banner';

describe('renderEntityBanner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('uses a deterministic gradient for the same entity id', () => {
    const a = gradientForEntityId('class_2026_12engadv1');
    const b = gradientForEntityId('class_2026_12engadv1');
    expect(a).toBe(b);

    const hue = bannerHueFromEntityId('class_2026_12engadv1');
    expect(a).toContain(`hsl(${hue} 32% 26%)`);
    expect(a).toContain(`hsl(${(hue + 38) % 360} 38% 17%)`);

    renderEntityBanner(host, {
      entityId: 'class_2026_12engadv1',
      title: '12ENGADV1',
      media: []
    });
    const fallback = host.querySelector('.entity-banner__fallback');
    expect(fallback?.getAttribute('style')).toContain(a);
  });

  it('renders title and eyebrow on the scrim without URL inputs', () => {
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      eyebrow: 'Year 12 · English Advanced',
      media: [],
      editable: true
    });

    expect(host.querySelector('.entity-banner__title')?.textContent).toBe('12ENA6');
    expect(host.querySelector('.entity-banner__eyebrow')?.textContent).toBe(
      'Year 12 · English Advanced'
    );
    expect(host.querySelector('.entity-banner__scrim')).not.toBeNull();
    expect(host.querySelector('.cover-picker__url')).toBeNull();
    expect(host.querySelector('.cover-picker__alt')).toBeNull();
    expect(host.querySelector('input[type="url"]')).toBeNull();
  });

  it('shows Change cover when editable and opens the picker dialog', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);

    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      media: [],
      editable: true,
      onSave
    });

    const edit = host.querySelector<HTMLButtonElement>('.entity-banner__edit');
    expect(edit?.textContent).toBe('Change cover');
    edit?.click();

    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector('.cover-picker__url')).not.toBeNull();
    expect(dialog?.querySelector('.cover-picker__alt')).not.toBeNull();

    const url = dialog!.querySelector<HTMLInputElement>('.cover-picker__url')!;
    url.value = 'https://cdn.example.com/banner.jpg';
    dialog!.querySelector<HTMLButtonElement>('.cover-picker button.btn--secondary')!.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example.com/banner.jpg' })
    );
    expect(document.querySelector('.entity-banner__dialog')).toBeNull();
    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/banner.jpg'
    );
  });

  it('omits Change cover when not editable', () => {
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      media: [],
      editable: false
    });
    expect(host.querySelector('.entity-banner__edit')).toBeNull();
  });

  it('uses cover image and coverAltText when a cover URL resolves', () => {
    const media: Media[] = [];
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { url: 'https://cdn.example.com/cover.jpg', alt_text: 'Banner art' },
      media
    });

    const img = host.querySelector<HTMLImageElement>('.entity-banner__image');
    expect(img?.src).toContain('cdn.example.com/cover.jpg');
    expect(img?.alt).toBe('Banner art');
  });
});
