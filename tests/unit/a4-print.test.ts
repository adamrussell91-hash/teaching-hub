import { describe, it, expect } from 'vitest';
import { estimatePageCount, A4 } from '@/print/a4';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';

function minimalLesson(overrides: Partial<Lesson> = {}): Lesson {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'lesson_print_1',
    type: 'lesson',
    title: 'Forces worksheet',
    slug: 'forces_worksheet',
    status: 'active',
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [],
    created_at: now,
    updated_at: now,
    schema_version: 1,
    ...overrides
  };
}

describe('A4 constants', () => {
  it('exposes portrait dimensions and margins', () => {
    expect(A4.widthMm).toBe(210);
    expect(A4.heightMm).toBe(297);
    expect(A4.marginMm).toBe(15);
  });

  it('estimates page count from content height', () => {
    const printable = A4.heightMm - A4.marginMm * 2;
    expect(estimatePageCount(printable)).toBe(1);
    expect(estimatePageCount(printable + 1)).toBe(2);
    expect(estimatePageCount(0)).toBe(1);
  });
});

describe('renderPrintLesson', () => {
  it('builds a print document with title and student-visible blocks', () => {
    const visible = createBlock('heading', 'block_visible');
    if (visible.block_type === 'heading') visible.content.text = 'Learning intention';
    const hidden = createBlock('callout', 'block_hidden');
    hidden.visibility = 'teacher_only';

    const root = renderPrintLesson(
      minimalLesson({ blocks: [visible, hidden] })
    );

    expect(root.classList.contains('print-document')).toBe(true);
    expect(root.querySelector('.print-document__title')?.textContent).toBe(
      'Forces worksheet'
    );
    expect(root.querySelectorAll('[data-block-id]').length).toBe(1);
    expect(root.querySelector(`[data-block-id="${hidden.id}"]`)).toBeNull();
  });
});
