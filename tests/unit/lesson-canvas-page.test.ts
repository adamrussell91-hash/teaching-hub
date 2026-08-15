import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';
import { isTextLike } from '@/teacher/lesson-canvas/kinds';
import { mountLessonPage } from '@/teacher/lesson-canvas/mount-page';

const MIME = 'application/x-teaching-hub-block';
const ISO = '2026-01-01T00:00:00.000Z';

class Dt {
  store = new Map<string, string>();
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  setData(type: string, value: string): void {
    this.store.set(type, value);
  }
  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
}

function dispatchDrop(el: Element, payload: unknown): void {
  const dt = new Dt();
  dt.setData(MIME, JSON.stringify(payload));
  const over = new Event('dragover', { bubbles: true, cancelable: true });
  Object.defineProperty(over, 'dataTransfer', { value: dt });
  el.dispatchEvent(over);
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: dt });
  el.dispatchEvent(drop);
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson_001',
    type: 'lesson',
    title: 'Intro to Testing',
    slug: 'intro_to_testing',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    blocks: [createBlock('heading', 'h1'), createBlock('concept_map', 'cm1')],
    ...overrides
  };
}

describe('isTextLike', () => {
  it('treats rich_text heading callout quote definition and code as text-like', () => {
    expect(isTextLike('heading')).toBe(true);
    expect(isTextLike('rich_text')).toBe(true);
    expect(isTextLike('callout')).toBe(true);
    expect(isTextLike('quote')).toBe(true);
    expect(isTextLike('definition')).toBe(true);
    expect(isTextLike('code')).toBe(true);
    expect(isTextLike('concept_map')).toBe(false);
    expect(isTextLike('image')).toBe(false);
  });
});

describe('mountLessonPage', () => {
  let host: HTMLElement;
  let ids: string[];

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    ids = ['new_1', 'new_2'];
  });

  afterEach(() => {
    host.remove();
    document.body.replaceChildren();
  });

  function mount(lesson: Lesson = makeLesson(), extras: { onSaveTemplate?: () => void } = {}) {
    const onChange = vi.fn();
    const onPrint = vi.fn();
    const onSelect = vi.fn();
    const handle = mountLessonPage(host, {
      lesson,
      media: [],
      onChange,
      onPrint,
      onSelect,
      idFactory: () => ids.shift() ?? 'new_x',
      ...extras
    });
    return { handle, onChange, onPrint, onSelect };
  }

  it('shows the lesson title and reports title edits via onChange', () => {
    const { onChange } = mount();
    const title = host.querySelector<HTMLInputElement | HTMLElement>('.lesson-page__title');
    expect(title).not.toBeNull();

    if (title instanceof HTMLInputElement || title instanceof HTMLTextAreaElement) {
      expect(title.value).toBe('Intro to Testing');
      title.value = 'Renamed lesson';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      expect(title!.textContent).toBe('Intro to Testing');
      title!.textContent = 'Renamed lesson';
      title!.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.title).toBe('Renamed lesson');
  });

  it('mounts a cover host', () => {
    mount();
    const cover =
      host.querySelector('.lesson-page__cover') ?? host.querySelector('.cover-picker');
    expect(cover).not.toBeNull();
  });

  it('edits text-like blocks inline without move-up towers', () => {
    mount();
    const headingEditor = host.querySelector('.block-editor[data-block-type="heading"]');
    expect(headingEditor).not.toBeNull();
    expect(host.querySelector('.block-editor__move-up')).toBeNull();
    expect(host.querySelector('.lesson-editor__reorder')).toBeNull();
  });

  it('renders heavy blocks and shows inspector plus toolbar on select', () => {
    const { onSelect } = mount();
    const map = host.querySelector<HTMLElement>('[data-block-id="cm1"]');
    expect(map).not.toBeNull();
    expect(host.querySelector('.block-concept-map, .block[data-block-type="concept_map"]')).not.toBeNull();

    map!.click();
    expect(onSelect).toHaveBeenCalledWith('cm1');
    expect(host.querySelector('.lesson-page__inspector')).not.toBeNull();
    expect(host.querySelector('.lesson-page__inspector .block-editor')).not.toBeNull();

    const toolbarText = host.textContent ?? '';
    expect(toolbarText).toContain('Duplicate');
    expect(toolbarText).toContain('Delete');
    expect(
      host.querySelector('.block-editor__visibility, [aria-label="Visibility"], select')
    ).not.toBeNull();
    expect(host.querySelector('.block-editor__move-up')).toBeNull();
  });

  it('inserts a heading when a palette payload is dropped on a gap', () => {
    const { onChange } = mount();
    const gaps = host.querySelectorAll('.lesson-page__gap');
    expect(gaps.length).toBeGreaterThanOrEqual(3);

    dispatchDrop(gaps[0]!, { kind: 'block', type: 'heading' });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks[0]?.block_type).toBe('heading');
    expect(next.blocks[0]?.id).toBe('new_1');
    expect(next.blocks.map((b) => b.id)).toEqual(['new_1', 'h1', 'cm1']);
  });

  it('shows a hint and does not insert an invalid collection drop at root', () => {
    const { onChange } = mount();
    const gap = host.querySelector('.lesson-page__gap')!;
    dispatchDrop(gap, { type: 'collection' });

    expect(onChange).not.toHaveBeenCalled();
    const hint = host.querySelector('.lesson-page__hint');
    expect(hint).not.toBeNull();
    expect((hint?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('calls onPrint from the Print control', () => {
    const { onPrint } = mount();
    const print = host.querySelector<HTMLButtonElement>('[aria-label="Print"]');
    expect(print).not.toBeNull();
    print!.click();
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('includes Save as lesson template in the page menu', () => {
    const onSaveTemplate = vi.fn();
    mount(makeLesson(), { onSaveTemplate });

    const save = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Save as lesson template')
    );
    expect(save).toBeTruthy();
    save!.click();
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps drop gaps pointer-events auto while a palette drag is active', () => {
    mount();
    const palette = document.createElement('div');
    palette.className = 'lesson-palette';
    palette.dataset.dragging = 'true';
    document.body.append(palette);

    document.dispatchEvent(new Event('dragover', { bubbles: true }));

    const gap = host.querySelector<HTMLElement>('.lesson-page__gap')!;
    expect(getComputedStyle(gap).pointerEvents).toBe('auto');
  });
});
