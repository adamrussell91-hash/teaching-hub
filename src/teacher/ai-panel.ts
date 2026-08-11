import {
  AGENTS,
  agentColour,
  readLastAgentSlug,
  writeLastAgentSlug,
  type AgentSlug
} from '@/ai/agents';
import { actionsForScope } from '@/ai/capabilities';
import { streamAiChat } from '@/ai/client';
import type { AiProposal } from '@/ai/proposals';
import type { AiScope } from '@/ai/proposals';
import type { Block } from '@/schemas/block';

export interface AiPanelHandle {
  setSelection(selection: {
    blockId: string | null;
    blockType: Block['block_type'] | null;
    scope: AiScope;
  }): void;
  dispose(): void;
}

export interface MountAiPanelOptions {
  lessonId: string;
  onAcceptProposal: (proposal: AiProposal) => { ok: boolean; message?: string };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agent?: AgentSlug;
  text: string;
  proposal?: AiProposal;
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
}

function transcriptKey(lessonId: string): string {
  return `teaching_hub_ai_transcript_${lessonId}`;
}

function loadTranscript(lessonId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(transcriptKey(lessonId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveTranscript(lessonId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(transcriptKey(lessonId), JSON.stringify(messages.slice(-40)));
  } catch {
    /* ignore */
  }
}

export function mountAiPanel(host: HTMLElement, options: MountAiPanelOptions): AiPanelHandle {
  host.classList.add('ai-panel');

  let agentSlug = readLastAgentSlug();
  let selectedBlockId: string | null = null;
  let selectedBlockType: Block['block_type'] | null = null;
  let scope: AiScope = 'block';
  let messages = loadTranscript(options.lessonId);
  let busy = false;
  let abort: AbortController | null = null;
  let msgCounter = 0;

  const picker = document.createElement('div');
  picker.className = 'ai-panel__picker';
  picker.setAttribute('role', 'listbox');
  picker.setAttribute('aria-label', 'AI agents');

  const hero = document.createElement('div');
  hero.className = 'ai-panel__hero';
  hero.hidden = true;

  const heroImg = document.createElement('img');
  heroImg.className = 'ai-panel__hero-img';
  heroImg.alt = '';

  const heroName = document.createElement('p');
  heroName.className = 'ai-panel__hero-name';
  hero.append(heroImg, heroName);

  const scopeChip = document.createElement('p');
  scopeChip.className = 'ai-panel__scope';

  const actionsBar = document.createElement('div');
  actionsBar.className = 'ai-panel__actions';

  const empty = document.createElement('p');
  empty.className = 'ai-panel__empty';
  empty.textContent = 'Select a block or section to work with.';

  const thread = document.createElement('div');
  thread.className = 'ai-panel__thread';

  const composer = document.createElement('form');
  composer.className = 'ai-panel__composer';

  const input = document.createElement('textarea');
  input.className = 'ai-panel__input';
  input.rows = 3;
  input.placeholder = 'Ask the selected agent…';
  input.setAttribute('aria-label', 'Message');

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'btn btn--primary';
  sendBtn.textContent = 'Send';

  composer.append(input, sendBtn);
  host.replaceChildren(picker, hero, scopeChip, actionsBar, empty, thread, composer);

  function nextMsgId(): string {
    msgCounter += 1;
    return `m_${Date.now()}_${msgCounter}`;
  }

  function renderPicker(): void {
    picker.replaceChildren();
    for (const agent of AGENTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-panel__agent';
      if (agent.slug === agentSlug) btn.classList.add('ai-panel__agent--active');
      btn.style.setProperty('--agent-colour', agent.colour);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', agent.slug === agentSlug ? 'true' : 'false');
      btn.title = agent.name;

      const img = document.createElement('img');
      img.src = agent.avatarSrc;
      img.alt = agent.name;
      img.className = 'ai-panel__agent-avatar';
      btn.append(img);
      btn.addEventListener('click', () => {
        agentSlug = agent.slug;
        writeLastAgentSlug(agent.slug);
        renderPicker();
        renderHero();
      });
      picker.append(btn);
    }
  }

  function renderHero(): void {
    const agent = AGENTS.find((a) => a.slug === agentSlug)!;
    hero.hidden = false;
    hero.style.setProperty('--agent-colour', agent.colour);
    heroImg.src = agent.heroSrc;
    heroImg.alt = agent.name;
    heroName.textContent = agent.name;
  }

  function renderScope(): void {
    if (!selectedBlockId) {
      scopeChip.textContent = 'Working with: nothing selected';
      return;
    }
    const label =
      scope === 'section'
        ? 'Working with: Section'
        : `Working with: Selected Block${selectedBlockType ? ` (${selectedBlockType})` : ''}`;
    scopeChip.textContent = label;
  }

  function renderActions(): void {
    actionsBar.replaceChildren();
    if (!selectedBlockId) return;
    const actions = actionsForScope(scope, selectedBlockType);
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost ai-panel__action';
      btn.textContent = action.label;
      btn.disabled = busy || !selectedBlockId;
      btn.addEventListener('click', () => {
        void sendMessage(`Please ${action.label.toLowerCase()} the selected content.`, action.id);
      });
      actionsBar.append(btn);
    }
  }

  function renderThread(): void {
    thread.replaceChildren();
    for (const msg of messages) {
      const row = document.createElement('div');
      row.className = `ai-panel__msg ai-panel__msg--${msg.role}`;
      if (msg.agent) row.style.setProperty('--agent-colour', agentColour(msg.agent));

      if (msg.role === 'assistant' && msg.agent) {
        const agent = AGENTS.find((a) => a.slug === msg.agent);
        if (agent) {
          const avatar = document.createElement('img');
          avatar.className = 'ai-panel__msg-avatar';
          avatar.src = agent.avatarSrc;
          avatar.alt = agent.name;
          row.append(avatar);
        }
      }

      const bubble = document.createElement('div');
      bubble.className = 'ai-panel__bubble';
      bubble.textContent = msg.text;
      row.append(bubble);

      if (msg.proposal && msg.proposal.kind !== 'review_only') {
        const card = document.createElement('div');
        card.className = 'ai-panel__proposal';
        const title = document.createElement('p');
        title.className = 'ai-panel__proposal-title';
        title.textContent =
          msg.proposalStatus === 'accepted'
            ? 'Proposal accepted'
            : msg.proposalStatus === 'rejected'
              ? 'Proposal rejected'
              : `Proposal: ${msg.proposal.kind.replaceAll('_', ' ')}`;
        card.append(title);

        if (msg.proposalStatus === 'pending') {
          const actions = document.createElement('div');
          actions.className = 'ai-panel__proposal-actions';
          const accept = document.createElement('button');
          accept.type = 'button';
          accept.className = 'btn btn--primary';
          accept.textContent = 'Accept';
          accept.addEventListener('click', () => {
            const result = options.onAcceptProposal(msg.proposal!);
            msg.proposalStatus = result.ok ? 'accepted' : 'pending';
            if (!result.ok) {
              messages.push({
                id: nextMsgId(),
                role: 'system',
                text: result.message ?? 'Could not apply proposal'
              });
            }
            saveTranscript(options.lessonId, messages);
            renderThread();
          });
          const reject = document.createElement('button');
          reject.type = 'button';
          reject.className = 'btn btn--secondary';
          reject.textContent = 'Reject';
          reject.addEventListener('click', () => {
            msg.proposalStatus = 'rejected';
            saveTranscript(options.lessonId, messages);
            renderThread();
          });
          const regen = document.createElement('button');
          regen.type = 'button';
          regen.className = 'btn btn--ghost';
          regen.textContent = 'Regenerate';
          regen.addEventListener('click', () => {
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (lastUser) void sendMessage(lastUser.text);
          });
          actions.append(accept, reject, regen);
          card.append(actions);
        }
        row.append(card);
      } else if (msg.proposal?.kind === 'review_only') {
        const note = document.createElement('p');
        note.className = 'ai-panel__review';
        note.textContent = msg.proposal.summary;
        row.append(note);
      }

      thread.append(row);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function renderShell(): void {
    const hasSelection = Boolean(selectedBlockId);
    empty.hidden = hasSelection;
    actionsBar.hidden = !hasSelection;
    composer.hidden = !hasSelection;
    thread.hidden = !hasSelection;
    input.disabled = busy || !hasSelection;
    sendBtn.disabled = busy || !hasSelection;
    renderScope();
    renderActions();
    renderThread();
  }

  async function sendMessage(text: string, action?: string): Promise<void> {
    if (!selectedBlockId || busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    busy = true;
    renderShell();

    messages.push({ id: nextMsgId(), role: 'user', text: trimmed });
    const assistantId = nextMsgId();
    messages.push({ id: assistantId, role: 'assistant', agent: agentSlug, text: '' });
    saveTranscript(options.lessonId, messages);
    renderThread();

    abort?.abort();
    abort = new AbortController();

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .filter((m) => m.text.trim())
      .slice(-12)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text
      }));

    try {
      await streamAiChat(
        {
          lesson_id: options.lessonId,
          agent: agentSlug,
          scope,
          selected_block_id: selectedBlockId,
          message: trimmed,
          action,
          history
        },
        (event) => {
          const assistant = messages.find((m) => m.id === assistantId);
          if (!assistant) return;
          if (event.type === 'text') {
            assistant.text += event.text;
            renderThread();
          } else if (event.type === 'proposal') {
            if (event.proposal.kind === 'review_only') {
              assistant.proposal = event.proposal;
              if (!assistant.text.trim()) assistant.text = event.proposal.summary;
            } else {
              assistant.proposal = event.proposal;
              assistant.proposalStatus = 'pending';
              if (!assistant.text.trim()) {
                assistant.text = 'Proposed a change — review and Accept to apply.';
              }
            }
            renderThread();
          } else if (event.type === 'error') {
            assistant.text = assistant.text || event.message;
            renderThread();
          } else if (event.type === 'status' && !assistant.text) {
            assistant.text = event.text;
            renderThread();
          }
        },
        abort.signal
      );
    } catch (err) {
      const assistant = messages.find((m) => m.id === assistantId);
      if (assistant && !assistant.text) {
        assistant.text = err instanceof Error ? err.message : 'AI request failed';
      }
    } finally {
      busy = false;
      saveTranscript(options.lessonId, messages);
      renderShell();
    }
  }

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    void sendMessage(value);
  });

  renderPicker();
  renderHero();
  renderShell();

  return {
    setSelection(selection) {
      selectedBlockId = selection.blockId;
      selectedBlockType = selection.blockType;
      scope = selection.scope;
      renderShell();
    },
    dispose() {
      abort?.abort();
      host.replaceChildren();
      host.classList.remove('ai-panel');
    }
  };
}
