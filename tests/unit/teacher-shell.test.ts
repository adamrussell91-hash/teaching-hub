import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderTeacherShell } from '@/teacher/shell';

describe('teacher shell', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  it('renders brand without sign-out when onLogout is omitted', () => {
    const refs = renderTeacherShell(root);
    expect(root.textContent).toContain('Teaching Hub');
    expect(refs.logoutButton).toBeNull();
    expect(root.querySelector('.hub-icon-btn')).toBeNull();
    expect(root.querySelector('.teacher-layout__logout')).toBeNull();
    expect(refs.jobsHost).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('.teacher-layout__jobs')).toBe(refs.jobsHost);
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#teacher-main');
    expect(refs.main.id).toBe('teacher-main');
  });

  it('renders sign-out and invokes onLogout when clicked', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const refs = renderTeacherShell(root, { onLogout });

    expect(refs.logoutButton).toBeInstanceOf(HTMLButtonElement);
    expect(refs.logoutButton?.classList.contains('hub-icon-btn')).toBe(true);
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
    expect(refs.logoutButton?.textContent).not.toBe('Sign out');
    expect(root.querySelector('.teacher-layout__utilities .hub-icon-btn')).toBe(refs.logoutButton);
    expect(refs.main.contains(refs.logoutButton)).toBe(true);
    expect(refs.rail.contains(refs.logoutButton!)).toBe(false);

    refs.logoutButton?.click();
    await vi.waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('hides the context bar when it has no children', () => {
    const refs = renderTeacherShell(root);
    expect(refs.contextBar.hidden).toBe(true);
  });
});
