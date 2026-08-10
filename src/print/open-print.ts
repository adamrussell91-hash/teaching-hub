import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 15mm; }
  html, body { margin: 0; padding: 0; }
  .print-document {
    box-sizing: border-box;
    width: auto;
    min-height: auto;
    padding: 0;
    background: #fff;
    color: #111;
    box-shadow: none;
  }
  .print-document__title {
    font-size: 1.5rem;
    margin: 0 0 1rem;
  }
  .block-question-set__response-lines {
    margin-top: 0.5rem;
  }
  .block-question-set__line {
    border-bottom: 1px solid #333;
    height: 1.5rem;
  }
  .block-print-fallback {
    border: 1px solid #ccc;
    padding: 0.5rem 0.75rem;
  }
  .block-columns--print-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .block-flashcards__controls,
  .block-cloze__controls,
  .block-self-check__controls { display: none !important; }
`;

export function openPrintLesson(lesson: Lesson): void {
  const docEl = renderPrintLesson(lesson);
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    window.alert('Allow pop-ups to print this lesson.');
    return;
  }

  const { document: doc } = printWindow;

  const title = doc.createElement('title');
  title.textContent = lesson.title.trim() || 'Print';
  doc.head.append(title);

  const style = doc.createElement('style');
  style.textContent = PRINT_CSS;
  doc.head.append(style);

  doc.body.replaceChildren(docEl);

  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 50);
}
