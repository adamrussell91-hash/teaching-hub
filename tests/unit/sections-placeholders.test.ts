import { describe, it, expect, beforeEach } from 'vitest';
import { renderResourcesPlaceholder } from '@/teacher/sections/placeholders';

describe('section placeholders', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
  });

  it('renders Resource Library coming-next copy', () => {
    renderResourcesPlaceholder(canvas);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Resource Library');
    expect(canvas.textContent).toContain('coming next');
  });
});
