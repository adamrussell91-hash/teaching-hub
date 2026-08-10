import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';

// Matches package.json katex version; used when no bundled stylesheet href is found.
const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';

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
  .block {
    margin-bottom: 0.75rem;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  .block-table,
  .block-chart__table {
    border-collapse: collapse;
    width: 100%;
  }
  .block-table th,
  .block-table td,
  .block-chart__table th,
  .block-chart__table td {
    border: 1px solid #ccc;
    padding: 0.25rem 0.5rem;
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
    display: flex !important;
    flex-direction: column;
    gap: 0.75rem;
    grid-template-columns: none;
  }
  .block-flashcards__controls,
  .block-cloze__controls,
  .block-self-check__controls,
  .block-gallery__controls,
  .block-gallery__nav { display: none !important; }
  .block-flashcards__print,
  .block-cloze__print,
  .block-self-check__print { display: block !important; }
`;

function katexStylesheetHref(): string | null {
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    if (href && /katex/i.test(href)) return href;
  }
  return KATEX_CSS_URL;
}

async function waitForImages(docEl: HTMLElement, timeoutMs = 1500): Promise<void> {
  const images = Array.from(docEl.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    })
  ]);
}

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

  const katexHref = katexStylesheetHref();
  if (katexHref) {
    const katexLink = doc.createElement('link');
    katexLink.rel = 'stylesheet';
    katexLink.href = katexHref;
    doc.head.append(katexLink);
  }

  const style = doc.createElement('style');
  style.textContent = PRINT_CSS;
  doc.head.append(style);

  doc.body.replaceChildren(docEl);

  void (async () => {
    await waitForImages(docEl);
    printWindow.focus();
    printWindow.print();
  })();
}
