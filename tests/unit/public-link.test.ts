import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  absolutePublicUrl,
  mountPublicLinkControl,
  publicStudentPath
} from '@/teacher/public-link';

describe('public link helpers', () => {
  it('builds ID-based student paths', () => {
    expect(publicStudentPath('lesson', 'lesson_1')).toBe('/s/lessons/lesson_1');
    expect(publicStudentPath('unit', 'unit_1')).toBe('/s/units/unit_1');
    expect(publicStudentPath('class', 'class_1')).toBe('/s/classes/class_1');
    expect(absolutePublicUrl('lesson', 'lesson_1', 'https://hub.example')).toBe(
      'https://hub.example/s/lessons/lesson_1'
    );
  });
});

describe('mountPublicLinkControl', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('explains drafts and does not offer copy', () => {
    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: false
    });
    host.querySelector('button')!.click();
    expect(host.textContent).toMatch(/Publish this lesson/i);
    expect(host.querySelector('.public-link__actions')).toBeNull();
    handle.dispose();
  });

  it('shows copy and open for published lessons', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: true
    });
    host.querySelector('button')!.click();
    expect(host.querySelector('.public-link__url')?.textContent).toContain('/s/lessons/lesson_1');
    const copy = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Copy');
    expect(copy).toBeTruthy();
    copy!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalled();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/s/lessons/lesson_1');
    handle.dispose();
  });
});
