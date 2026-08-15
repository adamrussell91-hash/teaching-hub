import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeLastAgentSlug } from '@/ai/agents';
import { streamAiChat } from '@/ai/client';
import { pollAiJob, startAiJob } from '@/ai/jobs-client';
import type { AiJob } from '@/ai/jobs';
import type { AiProposal } from '@/ai/proposals';
import { mountAiPanel, type AiPanelHandle, type MountAiPanelOptions } from '@/teacher/ai-panel';

vi.mock('@/ai/client', () => ({ streamAiChat: vi.fn() }));
vi.mock('@/ai/jobs-client', () => ({ startAiJob: vi.fn(), pollAiJob: vi.fn() }));

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const streamAiChatMock = vi.mocked(streamAiChat);
const startAiJobMock = vi.mocked(startAiJob);
const pollAiJobMock = vi.mocked(pollAiJob);

const SNAPSHOT = '2026-01-01T00:00:00.000Z';

const replaceLesson: AiProposal = {
  kind: 'replace_lesson',
  title: 'Built lesson',
  blocks: []
};

function workingJob(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: 'job_1',
    lesson_id: 'lesson_1',
    agent: 'clementine',
    status: 'working',
    snapshot_at: SNAPSHOT,
    message: 'Build a lesson',
    created_at: SNAPSHOT,
    ...overrides
  };
}

function mountPanel(overrides: Partial<MountAiPanelOptions> = {}): {
  host: HTMLElement;
  handle: AiPanelHandle;
  onAcceptProposal: ReturnType<typeof vi.fn>;
} {
  const host = document.createElement('div');
  document.body.append(host);
  const onAcceptProposal = vi.fn(() => ({ ok: true }));
  const handle = mountAiPanel(host, {
    lessonId: 'lesson_1',
    getSnapshotAt: () => SNAPSHOT,
    onAcceptProposal,
    ...overrides
  });
  return { host, handle, onAcceptProposal };
}

function composer(host: HTMLElement): {
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  send: HTMLButtonElement;
} {
  const form = host.querySelector<HTMLFormElement>('.ai-panel__composer');
  const input = host.querySelector<HTMLTextAreaElement>('.ai-panel__input');
  const send = host.querySelector<HTMLButtonElement>('.ai-panel__composer button[type="submit"]');
  if (!form || !input || !send) throw new Error('composer not found');
  return { form, input, send };
}

function submitMessage(host: HTMLElement, text: string): void {
  const { form, input } = composer(host);
  input.value = text;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function acceptButton(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Accept');
}

describe('mountAiPanel', () => {
  let handle: AiPanelHandle | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    document.body.replaceChildren();
    streamAiChatMock.mockResolvedValue(undefined);
    startAiJobMock.mockResolvedValue({ id: 'job_1', status: 'working' });
    pollAiJobMock.mockResolvedValue({
      ...workingJob(),
      status: 'done',
      proposal: replaceLesson
    });
    handle = undefined;
  });

  afterEach(() => {
    handle?.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('enables the composer with no block selected and does not use the old empty copy', () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    const { input, send, form } = composer(mounted.host);

    expect(form.hidden).toBe(false);
    expect(input.disabled).toBe(false);
    expect(send.disabled).toBe(false);
    expect(mounted.host.textContent).not.toContain('Select a block or section to work with.');

    handle.setSelection({ blockId: null, blockType: null, scope: 'lesson' });
    expect(composer(mounted.host).input.disabled).toBe(false);
    expect(composer(mounted.host).send.disabled).toBe(false);
  });

  it('sends with Ann on empty selection and omits selected_block_id from the payload', async () => {
    const mounted = mountPanel();
    handle = mounted.handle;

    submitMessage(mounted.host, 'Build a heading');

    await vi.waitFor(() => {
      expect(streamAiChatMock).toHaveBeenCalled();
    });
    expect(startAiJobMock).not.toHaveBeenCalled();

    const payload = streamAiChatMock.mock.calls[0]?.[0];
    expect(payload?.agent).toBe('ann');
    expect(payload?.selected_block_id).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('"selected_block_id":null');
  });

  it('routes Clementine through jobs and pulses working until poll completes', async () => {
    writeLastAgentSlug('clementine');
    const onWorkingChange = vi.fn();
    const firstPoll = workingJob();
    const donePoll = workingJob({ status: 'done', proposal: replaceLesson });
    pollAiJobMock.mockReset();
    pollAiJobMock.mockResolvedValueOnce(firstPoll).mockResolvedValueOnce(donePoll);

    const mounted = mountPanel({ onWorkingChange });
    handle = mounted.handle;

    const clementineBtn = [...mounted.host.querySelectorAll('button')].find(
      (btn) => btn.title === 'Professor Clementine Haig'
    );
    expect(clementineBtn).toBeTruthy();

    submitMessage(mounted.host, 'Build a lesson on X with six block types');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
    expect(streamAiChatMock).not.toHaveBeenCalled();
    expect(mounted.host.classList.contains('ai-panel--working')).toBe(true);
    expect(handle.isWorking()).toBe(true);
    expect(onWorkingChange).toHaveBeenCalledWith(true);

    await vi.waitFor(() => {
      expect(pollAiJobMock).toHaveBeenCalledWith('job_1', expect.anything());
      expect(mounted.host.classList.contains('ai-panel--working')).toBe(false);
    });
    expect(handle.isWorking()).toBe(false);
    expect(onWorkingChange).toHaveBeenCalledWith(false);
    expect(mounted.host.querySelector('.ai-panel__proposal')).not.toBeNull();
  });

  it('does not claim Job finished when Clementine is still working after the poll cap', async () => {
    vi.useFakeTimers();
    writeLastAgentSlug('clementine');
    pollAiJobMock.mockReset();
    pollAiJobMock.mockResolvedValue(workingJob());

    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Build a long lesson');

    try {
      await vi.runAllTimersAsync();
      expect(mounted.host.textContent).not.toContain('Job finished.');
      expect(mounted.host.textContent).toMatch(/timed out|still working/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Ann on streamAiChat after a block is selected', async () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    handle.setSelection({ blockId: 'block_1', blockType: 'heading', scope: 'block' });

    submitMessage(mounted.host, 'Rewrite this heading');

    await vi.waitFor(() => {
      expect(streamAiChatMock).toHaveBeenCalled();
    });
    expect(startAiJobMock).not.toHaveBeenCalled();
    expect(streamAiChatMock.mock.calls[0]?.[0]?.agent).toBe('ann');
    expect(streamAiChatMock.mock.calls[0]?.[0]?.selected_block_id).toBe('block_1');
  });

  it('shows Lesson or Looking at hint and never disables send', () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    const scopeChip = mounted.host.querySelector('.ai-panel__scope');

    expect(scopeChip?.textContent).toMatch(/Lesson/);
    expect(composer(mounted.host).send.disabled).toBe(false);

    handle.setSelection({ blockId: 'block_1', blockType: 'heading', scope: 'block' });
    expect(mounted.host.querySelector('.ai-panel__scope')?.textContent).toMatch(/Looking at:/);
    expect(composer(mounted.host).send.disabled).toBe(false);
  });

  it('calls onAcceptProposal when Accept is clicked on a replace_lesson proposal', async () => {
    streamAiChatMock.mockImplementation(async (_payload, onEvent) => {
      onEvent({ type: 'proposal', proposal: replaceLesson });
    });
    const mounted = mountPanel();
    handle = mounted.handle;

    submitMessage(mounted.host, 'Replace the lesson');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    acceptButton(mounted.host)?.click();

    expect(mounted.onAcceptProposal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'replace_lesson' })
    );
  });

  it('asks onStaleAccept when the snapshot changed and leaves the proposal pending if apply is not called', async () => {
    let snapshot = 't1';
    const onStaleAccept = vi.fn();
    streamAiChatMock.mockImplementation(async (_payload, onEvent) => {
      onEvent({ type: 'proposal', proposal: replaceLesson });
    });
    const mounted = mountPanel({
      getSnapshotAt: () => snapshot,
      onStaleAccept
    });
    handle = mounted.handle;

    submitMessage(mounted.host, 'Replace the lesson');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    snapshot = 't2';
    acceptButton(mounted.host)?.click();

    expect(onStaleAccept).toHaveBeenCalledTimes(1);
    expect(mounted.onAcceptProposal).not.toHaveBeenCalled();
    expect(acceptButton(mounted.host)).toBeTruthy();
    expect(mounted.host.textContent).toMatch(/Proposal:/);
    expect(mounted.host.textContent).not.toContain('Proposal accepted');
  });

  it('adds ai-panel--shelved when setShelved(true) and supports setWorking', () => {
    const onWorkingChange = vi.fn();
    const mounted = mountPanel({ onWorkingChange });
    handle = mounted.handle;

    handle.setShelved(true);
    expect(mounted.host.classList.contains('ai-panel--shelved')).toBe(true);
    handle.setShelved(false);
    expect(mounted.host.classList.contains('ai-panel--shelved')).toBe(false);

    expect(handle.isWorking()).toBe(false);
    handle.setWorking(true);
    expect(handle.isWorking()).toBe(true);
    expect(mounted.host.classList.contains('ai-panel--working')).toBe(true);
    expect(onWorkingChange).toHaveBeenCalledWith(true);
  });
});
