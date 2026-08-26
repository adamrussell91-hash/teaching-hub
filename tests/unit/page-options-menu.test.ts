import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';

describe('mountPageOptionsMenu', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens a kebab menu and runs the selected action', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSelect = vi.fn();
    const menu = mountPageOptionsMenu(
      [
        { label: 'Duplicate', onSelect },
        { label: 'Move to trash', danger: true, onSelect: () => undefined }
      ],
      { label: 'Options for Demo' }
    );
    host.append(menu.el);

    const trigger = menu.el.querySelector<HTMLButtonElement>('.page-options__trigger');
    expect(trigger?.getAttribute('aria-label')).toBe('Options for Demo');
    expect(menu.el.querySelector('.page-options__menu')?.hasAttribute('hidden')).toBe(true);

    trigger?.click();
    expect(menu.el.classList.contains('page-options--open')).toBe(true);
    expect(menu.el.querySelector('.page-options__item--danger')?.textContent).toBe('Move to trash');

    const duplicate = [...menu.el.querySelectorAll<HTMLButtonElement>('.page-options__item')].find(
      (item) => item.textContent === 'Duplicate'
    );
    duplicate?.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(menu.el.classList.contains('page-options--open')).toBe(false);

    menu.dispose();
  });
});
