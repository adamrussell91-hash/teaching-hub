import { listAiJobs, resolveAiJob } from '@/ai/jobs-client';
import type { AiJobInboxRow } from '@/ai/jobs-inbox';

export interface AiJobsInboxHandle {
  dispose(): void;
}

export interface MountAiJobsInboxOptions {
  onOpenLesson: (lessonId: string) => void;
  pollMs?: number;
}

function statusLabel(status: AiJobInboxRow['status']): string {
  if (status === 'working') return 'Working';
  if (status === 'done') return 'Ready';
  return 'Failed';
}

export function mountAiJobsInbox(
  host: HTMLElement,
  options: MountAiJobsInboxOptions
): AiJobsInboxHandle {
  host.classList.add('ai-jobs-inbox');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ai-jobs-inbox__toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.textContent = 'Jobs';

  const badge = document.createElement('span');
  badge.className = 'ai-jobs-inbox__badge';
  badge.hidden = true;

  toggle.append(badge);

  const panel = document.createElement('div');
  panel.className = 'ai-jobs-inbox__panel';
  panel.hidden = true;

  host.append(toggle, panel);

  let jobs: AiJobInboxRow[] = [];
  let disposed = false;
  const pollMs = options.pollMs ?? (import.meta.env.MODE === 'test' ? 50_000 : 4000);

  function render(): void {
    host.classList.toggle(
      'ai-jobs-inbox--working',
      jobs.some((job) => job.status === 'working')
    );
    if (jobs.length === 0) {
      badge.hidden = true;
      badge.textContent = '';
    } else {
      badge.hidden = false;
      badge.textContent = String(jobs.length);
    }

    panel.replaceChildren();
    if (jobs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ai-jobs-inbox__empty';
      empty.textContent = 'No jobs waiting.';
      panel.append(empty);
      return;
    }

    for (const job of jobs) {
      const row = document.createElement('div');
      row.className = 'ai-jobs-inbox__row';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'ai-jobs-inbox__open';
      open.textContent = `${job.lesson_title} · ${statusLabel(job.status)}`;
      open.addEventListener('click', () => {
        options.onOpenLesson(job.lesson_id);
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });
      row.append(open);

      if (job.status === 'error') {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'ai-jobs-inbox__dismiss';
        dismiss.textContent = 'Dismiss';
        dismiss.addEventListener('click', (event) => {
          event.stopPropagation();
          void resolveAiJob(job.id, 'dismissed').then(() => refresh());
        });
        row.append(dismiss);
      }

      panel.append(row);
    }
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    try {
      const inbox = await listAiJobs();
      if (disposed) return;
      jobs = inbox.jobs;
      render();
    } catch {
      if (disposed) return;
    }
  }

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  render();
  void refresh();
  const timer = window.setInterval(() => {
    void refresh();
  }, pollMs);

  return {
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      host.replaceChildren();
      host.classList.remove('ai-jobs-inbox', 'ai-jobs-inbox--working');
    }
  };
}
