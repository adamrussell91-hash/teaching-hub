import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { isTextLike } from '@/teacher/lesson-canvas/kinds';
import { mountBlockCanvas, mountLessonPage } from '@/teacher/lesson-canvas/mount-page';

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
  get types(): string[] {
    return [...this.store.keys()];
  }
  setDragImage(): void {}
}

function dispatchWithDt(el: Element, type: string, dt: Dt): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  el.dispatchEvent(event);
  return event;
}

function dispatchDrop(el: Element, payload: unknown): { dragoverAccepted: boolean } {
  const dt = new Dt();
  dt.setData(MIME, JSON.stringify(payload));
  const over = dispatchWithDt(el, 'dragover', dt);
  dispatchWithDt(el, 'drop', dt);
  return { dragoverAccepted: over.defaultPrevented };
}

function startGripDrag(grip: Element): Dt {
  const dt = new Dt();
  dispatchWithDt(grip, 'dragstart', dt);
  return dt;
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

  function mount(lesson: Lesson = makeLesson(), extras: { onSaveTemplate?: () => void; onExport?: () => void } = {}) {
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
    const heading = host.querySelector<HTMLElement>('[data-block-id="h1"]');
    expect(heading).not.toBeNull();
    heading!.click();
    const headingEditor = host.querySelector('.block-editor[data-block-type="heading"]');
    expect(headingEditor).not.toBeNull();
    expect(host.querySelector('.block-editor__move-up')).toBeNull();
    expect(host.querySelector('.lesson-editor__reorder')).toBeNull();
  });

  it('keeps a heavy block editor inside the block it belongs to', () => {
    mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();

    const inspector = host.querySelector('.lesson-page__inspector');
    expect(inspector).not.toBeNull();
    expect(inspector!.closest('[data-block-id]')?.getAttribute('data-block-id')).toBe('cm1');
    expect(inspector!.querySelector('.block-editor')).not.toBeNull();
  });

  it('reorders blocks with the toolbar move controls', () => {
    const { onChange } = mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();

    const up = host.querySelector<HTMLButtonElement>('.lesson-page__move-up');
    expect(up).not.toBeNull();
    expect(up!.disabled).toBe(false);
    up!.click();

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['cm1', 'h1']);
  });

  it('disables move up on the first block and move down on the last', () => {
    mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();
    expect(host.querySelector<HTMLButtonElement>('.lesson-page__move-down')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.lesson-page__move-up')!.disabled).toBe(false);
  });

  it('accepts a palette drop on a block body, not just the gap between blocks', () => {
    const { onChange } = mount();
    const row = host.querySelector('[data-block-id="cm1"]')!;

    const { dragoverAccepted } = dispatchDrop(row, { kind: 'block', type: 'heading' });

    expect(dragoverAccepted).toBe(true);
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['h1', 'new_1', 'cm1']);
  });

  it('marks the target gap while a drop is hovering so the teacher sees where it lands', () => {
    mount();
    const gap = host.querySelector<HTMLElement>('.lesson-page__gap')!;
    const dt = new Dt();
    dt.setData(MIME, JSON.stringify({ kind: 'block', type: 'heading' }));

    dispatchWithDt(gap, 'dragover', dt);

    expect(gap.classList.contains('lesson-page__gap--active')).toBe(true);
  });

  it('moves a block when its grip is dragged onto another block', () => {
    const lesson = makeLesson({
      blocks: [createBlock('heading', 'h1'), createBlock('concept_map', 'cm1'), createBlock('heading', 'h2')]
    });
    const { onChange } = mount(lesson);
    const grip = host.querySelector('[data-block-id="h1"] .lesson-page__grip');
    expect(grip).not.toBeNull();

    const dt = startGripDrag(grip!);
    expect(JSON.parse(dt.getData(MIME))).toEqual({ kind: 'move', block_id: 'h1' });

    const target = host.querySelector('[data-block-id="h2"]')!;
    dispatchWithDt(target, 'dragover', dt);
    dispatchWithDt(target, 'drop', dt);

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['cm1', 'h1', 'h2']);
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

  it('inserts an embed block when an embed:pdf palette payload is dropped at root', () => {
    const { onChange } = mount();
    const gap = host.querySelector('.lesson-page__gap')!;

    dispatchDrop(gap, { kind: 'block', type: 'embed:pdf' });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks[0]?.block_type).toBe('embed');
    expect(next.blocks[0]?.id).toBe('new_1');
    if (next.blocks[0]?.block_type === 'embed') {
      expect(next.blocks[0].content.provider).toBe('pdf');
    }
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

  it('calls onExport from the page menu', () => {
    const onExport = vi.fn();
    mount(makeLesson(), { onExport });
    const exportBtn = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Export JSON')
    );
    expect(exportBtn).toBeTruthy();
    host.querySelector<HTMLButtonElement>('[aria-label="Page menu"]')!.click();
    exportBtn!.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('hides Save as lesson template until the overflow menu is opened', () => {
    const onSaveTemplate = vi.fn();
    mount(makeLesson(), { onSaveTemplate });

    const save = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Save as lesson template')
    );
    expect(save).toBeTruthy();
    const menu = save!.closest<HTMLElement>('.lesson-page__menu');
    expect(menu?.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('[aria-label="Page menu"]')!.click();
    expect(menu?.hidden).toBe(false);

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

  it('forwards a composition drop to onCompositionDrop without inserting a block', () => {
    const onChange = vi.fn();
    const onCompositionDrop = vi.fn();
    mountLessonPage(host, {
      lesson: makeLesson({ blocks: [] }),
      media: [],
      onChange,
      onPrint: vi.fn(),
      onSelect: vi.fn(),
      idFactory: () => ids.shift() ?? 'new_x',
      onCompositionDrop
    });
    const gap = host.querySelector('.lesson-page__gap')!;
    dispatchDrop(gap, { kind: 'composition', id: 'composition_1' });

    expect(onCompositionDrop).toHaveBeenCalledWith('composition_1');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('mountBlockCanvas', () => {
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

  it('renders page blocks without lesson cover, title, or print chrome', () => {
    const heading = createBlock('heading', 'h1');
    mountBlockCanvas(host, {
      blocks: [heading],
      onChange: vi.fn(),
      idFactory: () => ids.shift() ?? 'new_x',
      heading: 'Announcements'
    });

    expect(host.querySelector('.lesson-page__heading')?.textContent).toBe('Announcements');
    expect(host.querySelector('.lesson-page__title')).toBeNull();
    expect(host.querySelector('.lesson-page__cover')).toBeNull();
    expect(host.querySelector('[aria-label="Print"]')).toBeNull();
    expect(host.querySelector('[aria-label="Page menu"]')).toBeNull();
    expect(host.querySelector('.lesson-page__gap')).not.toBeNull();
  });

  it('inserts a collection on drop and via insertType at page root', () => {
    const onChange = vi.fn();
    const handle = mountBlockCanvas(host, {
      blocks: [],
      onChange,
      idFactory: () => ids.shift() ?? 'new_x',
      allowCollectionAtRoot: true
    });

    dispatchDrop(host.querySelector('.lesson-page__gap')!, { kind: 'block', type: 'collection' });
    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0]![0] as Block[])[0]?.block_type).toBe('collection');

    onChange.mockClear();
    handle.update([]);
    handle.insertType('heading');
    expect((onChange.mock.calls.at(-1)?.[0] as Block[])[0]?.block_type).toBe('heading');
  });
});
