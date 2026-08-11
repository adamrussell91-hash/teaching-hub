import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { AiScope } from '@/ai/proposals';
import { findBlockById } from '@/blocks/find-block';
import { findEnclosingSection } from '@/ai/block-tree';
import { actionsForBlockType } from '@/ai/capabilities';

export interface AiContextInput {
  agentName: string;
  protocol: string;
  lesson: Lesson;
  scope: AiScope;
  selectedBlockId: string;
  action?: string;
  yearLabel?: string;
  subjectLabel?: string;
}

export function buildAiSystemPrompt(input: AiContextInput): string {
  const selected = findBlockById(input.lesson.blocks, input.selectedBlockId);
  const section =
    input.scope === 'section'
      ? findEnclosingSection(input.lesson.blocks, input.selectedBlockId) ??
        (selected?.block_type === 'section' ? selected : null)
      : null;

  const focus: Block | null =
    input.scope === 'section' ? section : selected;

  const actions = focus ? actionsForBlockType(focus.block_type) : [];
  const actionHint = input.action
    ? `Teacher selected quick action: ${input.action}. Perform that action on the focus content.`
    : 'Teacher sent a freeform instruction.';

  const schemaHint = focus
    ? `Focus block_type: ${focus.block_type}. Respond with tools when changing content. Preserve id "${focus.id}" on replace.`
    : 'No focus block found.';

  return [
    `You are ${input.agentName} assisting inside Teaching Hub (Australian English).`,
    '',
    input.protocol.trim(),
    '',
    '## Output rules',
    '- Use tools to propose schema-valid block changes. Do not claim the lesson was already updated.',
    '- Prefer propose_replace_block / propose_replace_section / propose_insert_blocks / review_only.',
    '- Never invent storage keys, publish, delete lessons, or change Class/Unit relationships.',
    '- Keep proposals minimal and schema-valid.',
    '',
    '## Teaching context',
    `Year: ${input.yearLabel ?? 'unknown'}`,
    `Subject: ${input.subjectLabel ?? 'unknown'}`,
    `Lesson title: ${input.lesson.title}`,
    `Lesson id: ${input.lesson.id}`,
    `Scope: ${input.scope}`,
    `Selected block id: ${input.selectedBlockId}`,
    schemaHint,
    `Available actions for this type: ${actions.map((a) => a.id).join(', ') || '(freeform only)'}`,
    actionHint,
    '',
    '## Focus JSON',
    focus ? JSON.stringify(focus) : 'null'
  ].join('\n');
}
