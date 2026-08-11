import { cloneBlockWithNewIds } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { AiProposal } from '@/ai/proposals';
import { applyInsertBlocks, replaceBlockInTree } from '@/ai/block-tree';

export function applyProposalToBlocks(
  blocks: Block[],
  proposal: AiProposal,
  nextId: () => string
): { blocks: Block[]; ok: boolean; message?: string } {
  if (proposal.kind === 'review_only') {
    return { blocks, ok: true };
  }

  if (proposal.kind === 'replace_block') {
    const withId = { ...proposal.block, id: proposal.block_id };
    const next = replaceBlockInTree(blocks, proposal.block_id, withId);
    const found = JSON.stringify(blocks) !== JSON.stringify(next);
    return found
      ? { blocks: next, ok: true }
      : { blocks, ok: false, message: 'Target block not found' };
  }

  if (proposal.kind === 'replace_section') {
    if (proposal.section.block_type !== 'section') {
      return { blocks, ok: false, message: 'Not a section' };
    }
    const section = {
      ...proposal.section,
      id: proposal.section_id,
      content: {
        ...proposal.section.content,
        blocks: (proposal.section.content.blocks as Block[]).map((child) =>
          cloneBlockWithNewIds(child, nextId)
        )
      }
    };
    const next = replaceBlockInTree(blocks, proposal.section_id, section as Block);
    const found = JSON.stringify(blocks) !== JSON.stringify(next);
    return found
      ? { blocks: next, ok: true }
      : { blocks, ok: false, message: 'Target section not found' };
  }

  const inserts = proposal.blocks.map((b) => cloneBlockWithNewIds(b, nextId));
  const result = applyInsertBlocks(blocks, proposal.anchor_block_id, proposal.position, inserts);
  return result.ok
    ? { blocks: result.blocks, ok: true }
    : { blocks, ok: false, message: 'Anchor block not found' };
}
