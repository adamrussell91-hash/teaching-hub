import { describe, expect, it } from 'vitest';
import { actionsForBlockType, actionsForScope } from '@/ai/capabilities';
import { applyProposalToBlocks } from '@/ai/apply-proposal';
import { findEnclosingSection, replaceBlockInTree } from '@/ai/block-tree';
import { buildAiSystemPrompt } from '@/ai/context';
import { parseToolProposal } from '@/ai/proposals';
import { createBlock } from '@/blocks/create-block';
import { DEFAULT_AGENT_SLUG, agentBySlug, agentColour } from '@/ai/agents';
import type { Lesson } from '@/schemas/lesson';
import type { Block } from '@/schemas/block';

describe('AI agents', () => {
  it('exposes four agents with locked colours', () => {
    expect(agentBySlug('ann')?.colour).toBe('#5B141A');
    expect(agentBySlug('clementine')?.colour).toBe('#3B57A8');
    expect(agentBySlug('hammond')?.colour).toBe('#2D2D2D');
    expect(agentBySlug('clare')?.colour).toBe('#F7DD4C');
    expect(DEFAULT_AGENT_SLUG).toBe('ann');
    expect(agentColour('ann')).toBe('#5B141A');
  });
});

describe('AI capabilities', () => {
  it('returns contextual actions for rich text and section scope', () => {
    expect(actionsForBlockType('rich_text').some((a) => a.id === 'shorten')).toBe(true);
    expect(actionsForBlockType('question_set').some((a) => a.id === 'generate_questions')).toBe(true);
    expect(actionsForScope('section', 'rich_text').some((a) => a.id === 'reorganise')).toBe(true);
  });
});

describe('AI block tree + proposals', () => {
  it('finds enclosing section and replaces nested blocks', () => {
    const inner = createBlock('rich_text', 'inner_1');
    const section = createBlock('section', 'sec_1');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content.blocks = [inner] as typeof section.content.blocks;
    expect(findEnclosingSection([section], 'inner_1')?.id).toBe('sec_1');

    const next = createBlock('rich_text', 'inner_1');
    if (next.block_type !== 'rich_text') throw new Error('expected rich_text');
    next.content.html = '<p>Changed</p>';
    const tree = replaceBlockInTree([section], 'inner_1', next);
    const updated = tree[0] as Extract<Block, { block_type: 'section' }>;
    const child = updated.content.blocks[0] as Extract<Block, { block_type: 'rich_text' }>;
    expect(child.content.html).toBe('<p>Changed</p>');
  });

  it('parses replace_block tool payloads and applies them', () => {
    const block = createBlock('heading', 'h1');
    if (block.block_type !== 'heading') throw new Error('expected heading');
    block.content.text = 'Original';
    const parsed = parseToolProposal('propose_replace_block', {
      block_id: 'h1',
      block: { ...block, content: { text: 'Revised', variant: 'section' } }
    });
    expect('kind' in parsed && parsed.kind === 'replace_block').toBe(true);
    if (!('kind' in parsed) || parsed.kind !== 'replace_block') return;
    const applied = applyProposalToBlocks([block], parsed, () => 'new_id');
    expect(applied.ok).toBe(true);
    expect(applied.blocks[0]?.block_type).toBe('heading');
    if (applied.blocks[0]?.block_type === 'heading') {
      expect(applied.blocks[0].content.text).toBe('Revised');
    }
  });
});

describe('AI context builder', () => {
  it('includes scope and focus JSON', () => {
    const block = createBlock('callout', 'c1');
    const lesson: Lesson = {
      id: 'lesson_1',
      type: 'lesson',
      title: 'Test',
      slug: 'test',
      status: 'active',
      unit_id: 'unit_1',
      sequence: 1,
      blocks: [block],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    };
    const prompt = buildAiSystemPrompt({
      agentName: "Ann O'Tation",
      protocol: 'Be precise.',
      lesson,
      scope: 'block',
      selectedBlockId: 'c1',
      action: 'shorten'
    });
    expect(prompt).toContain('Scope: block');
    expect(prompt).toContain('c1');
    expect(prompt).toContain('shorten');
    expect(prompt).toContain('Be precise.');
  });
});
