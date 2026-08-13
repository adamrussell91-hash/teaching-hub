import { ApiClientError } from '@/api/client';
import {
  dependenciesFromError,
  formatDependencyList,
  listTrash,
  permanentDelete,
  restoreFromTrash,
  type LifecycleEntityType,
  type TrashSummary
} from '@/teacher/lifecycle-api';
import { renderPageHeader } from '@/teacher/page-header';

const TYPE_LABELS: Record<LifecycleEntityType, string> = {
  lesson: 'Lesson',
  unit: 'Unit',
  class: 'Class',
  media: 'Resource',
  lesson_template: 'Lesson template',
  unit_template: 'Unit template',
  composition: 'Composition'
};

function typeLabel(type: LifecycleEntityType): string {
  return TYPE_LABELS[type] ?? type;
}

function formatTrashedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function renderTrashSection(canvas: HTMLElement): { dispose: () => void } {
  canvas.replaceChildren();
  renderPageHeader(canvas, { eyebrow: 'Workspace', title: 'Trash' });

  const root = document.createElement('div');
  root.className = 'trash-page';

  const status = document.createElement('p');
  status.className = 'trash-page__status';
  status.hidden = true;

  const list = document.createElement('div');
  list.className = 'trash-page__list';

  root.append(status, list);
  canvas.append(root);

  function setStatus(message: string | null, isError = false): void {
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.removeAttribute('role');
      status.classList.remove('trash-page__status--error');
      return;
    }
    status.hidden = false;
    status.textContent = message;
    if (isError) {
      status.setAttribute('role', 'alert');
      status.classList.add('trash-page__status--error');
    } else {
      status.removeAttribute('role');
      status.classList.remove('trash-page__status--error');
    }
  }

  function renderRows(rows: TrashSummary[]): void {
    list.replaceChildren();

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'teacher-layout__canvas-status';
      empty.textContent = 'Trash is empty.';
      list.append(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'trash-page__table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Type', 'Title', 'Trashed', 'Actions']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');

    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.dataset.trashId = row.id;
      tr.dataset.trashType = row.type;

      const typeCell = document.createElement('td');
      typeCell.textContent = typeLabel(row.type);

      const titleCell = document.createElement('td');
      titleCell.textContent = row.title;

      const whenCell = document.createElement('td');
      whenCell.textContent = formatTrashedAt(row.trashed_at);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'trash-page__actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn btn--secondary';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => {
        void (async () => {
          setStatus(null);
          try {
            await restoreFromTrash(row.type, row.id);
            setStatus(`Restored “${row.title}”.`);
            await reload();
          } catch (error) {
            const message =
              error instanceof ApiClientError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Unable to restore.';
            setStatus(message, true);
          }
        })();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn--ghost';
      deleteBtn.textContent = 'Delete permanently';
      deleteBtn.addEventListener('click', () => {
        void (async () => {
          if (
            !window.confirm(
              `Permanently delete “${row.title}”? This cannot be undone.`
            )
          ) {
            return;
          }
          setStatus(null);
          try {
            await permanentDelete(row.type, row.id);
            setStatus(`Deleted “${row.title}”.`);
            await reload();
          } catch (error) {
            const deps = dependenciesFromError(error);
            if (deps.length > 0) {
              setStatus(
                `Cannot delete “${row.title}” while dependencies remain:\n${formatDependencyList(deps)}`,
                true
              );
              return;
            }
            const message =
              error instanceof ApiClientError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Unable to delete.';
            setStatus(message, true);
          }
        })();
      });

      actionsCell.append(restoreBtn, deleteBtn);
      tr.append(typeCell, titleCell, whenCell, actionsCell);
      tbody.append(tr);
    }

    table.append(tbody);
    list.append(table);
  }

  async function reload(): Promise<void> {
    try {
      const rows = await listTrash();
      const sorted = [...rows].sort((a, b) => {
        const aTime = a.trashed_at ?? '';
        const bTime = b.trashed_at ?? '';
        return bTime.localeCompare(aTime);
      });
      renderRows(sorted);
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to load trash.';
      setStatus(message, true);
      list.replaceChildren();
    }
  }

  void reload();

  return { dispose: () => undefined };
}
