import { apiPut } from '@/api/client';
import { runNotionImport, type NotionImportResult } from '@/import/notion/run-import';
import type { Lesson } from '@/schemas/lesson';
import { postLesson } from '@/teacher/create/api';
import { getLesson } from '@/teacher/lessons-library/api';
import { uploadMediaFile } from '@/teacher/media-api';
import type { CurriculumLessonSummary } from '@/teacher/nav';

export interface NotionImportControlOptions {
  unitId: string;
  getExisting: () => CurriculumLessonSummary[];
  status: HTMLElement;
  onMutated?: () => void | Promise<void>;
  run?: typeof runNotionImport;
}

function formatStatus(result: NotionImportResult, total: number): string {
  if (total === 0) return 'No Notion pages in this zip.';
  if (result.failed === 0) {
    const count = result.imported + result.updated;
    return `Imported ${count} page${count === 1 ? '' : 's'}.`;
  }
  const ok = result.imported + result.updated;
  return `Imported ${ok} page${ok === 1 ? '' : 's'}. ${result.failed} failed.`;
}

export function mountNotionImport(
  button: HTMLButtonElement,
  options: NotionImportControlOptions
): { dispose: () => void; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.hidden = true;
  input.dataset.import = 'notion-file';
  button.insertAdjacentElement('afterend', input);

  let running = false;
  const run = options.run ?? runNotionImport;

  const onClick = (): void => {
    if (running) return;
    input.click();
  };

  const onChange = (): void => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || running) return;
    running = true;
    button.disabled = true;
    options.status.hidden = false;
    options.status.textContent = 'Importing…';

    void (async () => {
      try {
        const zipBytes = new Uint8Array(await file.arrayBuffer());
        const result = await run({
          zipBytes,
          unitId: options.unitId,
          existing: options.getExisting().map((lesson) => ({
            id: lesson.id,
            unit_id: lesson.unit_id,
            origin: lesson.origin
          })),
          deps: {
            postLesson,
            getLesson,
            putLesson: (lesson: Lesson) => apiPut(`/api/lessons/${lesson.id}`, lesson),
            uploadImage: async (image) => {
              const media = await uploadMediaFile(image);
              return { url: media.preview_url ?? media.download_url ?? '' };
            }
          },
          onProgress: (done, total) => {
            options.status.textContent = `Importing ${done} of ${total}…`;
          }
        });
        const total = result.imported + result.updated + result.failed;
        options.status.textContent = formatStatus(result, total);
        if (result.imported + result.updated > 0) await options.onMutated?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed.';
        options.status.textContent =
          /could not read that zip/i.test(message) ? "Couldn't read that zip." : message;
      } finally {
        running = false;
        button.disabled = false;
      }
    })();
  };

  button.addEventListener('click', onClick);
  input.addEventListener('change', onChange);

  return {
    input,
    dispose: () => {
      button.removeEventListener('click', onClick);
      input.removeEventListener('change', onChange);
      input.remove();
    }
  };
}
