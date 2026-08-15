import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listAiJobs, resolveAiJob } from '@/ai/jobs-client';
import { mountAiJobsInbox } from '@/teacher/ai-jobs-inbox';
import type { AiJobInbox } from '@/ai/jobs-inbox';

vi.mock('@/ai/jobs-client', () => ({
  listAiJobs: vi.fn(),
  resolveAiJob: vi.fn()
}));

const listAiJobsMock = vi.mocked(listAiJobs);
const resolveAiJobMock = vi.mocked(resolveAiJob);

const inbox = (jobs: AiJobInbox['jobs']): AiJobInbox => ({ jobs });

describe('mountAiJobsInbox', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listAiJobsMock.mockResolvedValue(inbox([]));
    resolveAiJobMock.mockResolvedValue({
      id: 'job_1',
      lesson_id: 'lesson_1',
      agent: 'clementine',
      status: 'error',
      snapshot_at: '2026-08-15T01:00:00.000Z',
      message: 'Build',
      created_at: '2026-08-15T01:00:00.000Z',
      resolution: 'dismissed'
    });
  });

  it('shows an empty state and no badge count', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const handle = mountAiJobsInbox(host, { onOpenLesson: vi.fn() });
    await vi.waitFor(() => {
      expect(host.textContent).toContain('No jobs waiting.');
    });
    expect((host.querySelector('.ai-jobs-inbox__badge') as HTMLElement | null)?.hidden).toBe(true);
    handle.dispose();
  });

  it('lists a ready job, pulses while working, and opens the lesson on click', async () => {
    listAiJobsMock.mockResolvedValue(
      inbox([
        {
          id: 'job_1',
          lesson_id: 'lesson_99',
          lesson_title: 'Othello',
          agent: 'clementine',
          status: 'working',
          created_at: '2026-08-15T01:00:00.000Z',
          message: 'Build a lesson'
        }
      ])
    );
    const onOpenLesson = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const handle = mountAiJobsInbox(host, { onOpenLesson });

    await vi.waitFor(() => {
      expect(host.querySelector('.ai-jobs-inbox__badge')?.textContent).toBe('1');
    });
    expect(host.classList.contains('ai-jobs-inbox--working')).toBe(true);

    host.querySelector<HTMLButtonElement>('.ai-jobs-inbox__toggle')?.click();
    const row = [...host.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Othello'));
    expect(row).toBeTruthy();
    row?.click();
    expect(onOpenLesson).toHaveBeenCalledWith('lesson_99');
    handle.dispose();
  });

  it('dismisses a failed job without opening the lesson', async () => {
    listAiJobsMock
      .mockResolvedValueOnce(
        inbox([
          {
            id: 'job_err',
            lesson_id: 'lesson_1',
            lesson_title: 'Hamlet',
            agent: 'clementine',
            status: 'error',
            created_at: '2026-08-15T01:00:00.000Z',
            message: 'Build'
          }
        ])
      )
      .mockResolvedValueOnce(inbox([]));

    const onOpenLesson = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const handle = mountAiJobsInbox(host, { onOpenLesson });

    await vi.waitFor(() => {
      expect(host.textContent).toContain('Hamlet');
    });
    host.querySelector<HTMLButtonElement>('.ai-jobs-inbox__toggle')?.click();
    const dismiss = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Dismiss');
    dismiss?.click();

    await vi.waitFor(() => {
      expect(resolveAiJobMock).toHaveBeenCalledWith('job_err', 'dismissed');
    });
    expect(onOpenLesson).not.toHaveBeenCalled();
    handle.dispose();
  });
});
