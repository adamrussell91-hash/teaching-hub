import { cloneBlockWithNewIds } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { AiProposal } from '@/ai/proposals';
import { applyInsertBlocks, replaceBlockInTree } from '@/ai/block-tree';
import {
  deleteBlocksById,
  reorderSiblings,
  type DropParent
} from '@/teacher/lesson-canvas/drop';

export type ApplyProposalResult = {
  ok: boolean;
  message?: string;
  lesson: Lesson;
};

function stubLesson(blocks: Block[]): Lesson {
  return {
    id: 'stub',
    type: 'lesson',
    title: '',
    slug: '',
    status: 'active',
    unit_id: 'stub',
    sequence: 0,
    blocks,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  };
}

function dropParentFromProposal(parent: Extract<AiProposal, { kind: 'reorder_blocks' }>['parent']): DropParent {
  if (parent.kind === 'root') return { kind: 'root' };
  if (parent.kind === 'section') return { kind: 'section', id: parent.id ?? '' };
  if (parent.kind === 'column') {
    return { kind: 'column', id: parent.id ?? '', columnIndex: parent.columnIndex ?? 0 };
  }
  return { kind: 'tab', id: parent.id ?? '', tabIndex: parent.tabIndex ?? 0 };
}

function withBlocks(lesson: Lesson, blocks: Block[]): Lesson {
  return { ...lesson, blocks };
}

export function applyProposalToLesson(
  lesson: Lesson,
  proposal: AiProposal,
  nextId: () => string
): ApplyProposalResult {
  if (proposal.kind === 'review_only') {
    return { ok: true, lesson };
  }

  if (proposal.kind === 'replace_block') {
    const withId = { ...proposal.block, id: proposal.block_id };
    const next = replaceBlockInTree(lesson.blocks, proposal.block_id, withId);
    const found = JSON.stringify(lesson.blocks) !== JSON.stringify(next);
    return found
      ? { ok: true, lesson: withBlocks(lesson, next) }
      : { ok: false, message: 'Target block not found', lesson };
  }

  if (proposal.kind === 'replace_section') {
    if (proposal.section.block_type !== 'section') {
      return { ok: false, message: 'Not a section', lesson };
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
    const next = replaceBlockInTree(lesson.blocks, proposal.section_id, section as Block);
    const found = JSON.stringify(lesson.blocks) !== JSON.stringify(next);
    return found
      ? { ok: true, lesson: withBlocks(lesson, next) }
      : { ok: false, message: 'Target section not found', lesson };
  }

  if (proposal.kind === 'replace_lesson') {
    const blocks = proposal.blocks.map((block) => cloneBlockWithNewIds(block, nextId));
    const next: Lesson = { ...lesson, blocks };
    if (proposal.title !== undefined) next.title = proposal.title;
    if (proposal.cover !== undefined) next.cover = proposal.cover;
    return { ok: true, lesson: next };
  }

  if (proposal.kind === 'insert_blocks') {
    const inserts = proposal.blocks.map((block) => cloneBlockWithNewIds(block, nextId));
    if (!proposal.anchor_block_id) {
      return { ok: true, lesson: withBlocks(lesson, [...lesson.blocks, ...inserts]) };
    }
    const result = applyInsertBlocks(
      lesson.blocks,
      proposal.anchor_block_id,
      proposal.position,
      inserts
    );
    return result.ok
      ? { ok: true, lesson: withBlocks(lesson, result.blocks) }
      : { ok: false, message: 'Anchor block not found', lesson };
  }

  if (proposal.kind === 'delete_blocks') {
    return { ok: true, lesson: withBlocks(lesson, deleteBlocksById(lesson.blocks, proposal.ids)) };
  }

  if (proposal.kind === 'reorder_blocks') {
    const result = reorderSiblings(
      lesson.blocks,
      dropParentFromProposal(proposal.parent),
      proposal.ordered_ids
    );
    return result.ok
      ? { ok: true, lesson: withBlocks(lesson, result.blocks) }
      : { ok: false, message: result.message, lesson };
  }

  return { ok: false, message: 'Unknown proposal', lesson };
}

export function applyProposalToBlocks(
  blocks: Block[],
  proposal: AiProposal,
  nextId: () => string
): { blocks: Block[]; ok: boolean; message?: string } {
  const applied = applyProposalToLesson(stubLesson(blocks), proposal, nextId);
  return { blocks: applied.lesson.blocks, ok: applied.ok, message: applied.message };
}
