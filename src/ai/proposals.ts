import { z } from 'zod';
import { BlockSchema } from '@/schemas/block';

export const AiScopeSchema = z.enum(['block', 'section']);
export type AiScope = z.infer<typeof AiScopeSchema>;

export const AiChatRequestSchema = z.object({
  lesson_id: z.string().min(1),
  agent: z.enum(['ann', 'clementine', 'hammond', 'clare']),
  scope: AiScopeSchema,
  selected_block_id: z.string().min(1),
  message: z.string().min(1).max(8000),
  action: z.string().min(1).max(80).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(16000)
      })
    )
    .max(20)
    .optional()
});

export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const ProposeReplaceBlockSchema = z.object({
  block_id: z.string().min(1),
  block: BlockSchema
});

export const ProposeReplaceSectionSchema = z.object({
  section_id: z.string().min(1),
  section: BlockSchema
});

export const ProposeInsertBlocksSchema = z.object({
  anchor_block_id: z.string().min(1),
  position: z.enum(['above', 'below']),
  blocks: z.array(BlockSchema).min(1).max(12)
});

export const ReviewOnlySchema = z.object({
  summary: z.string().min(1).max(4000)
});

export type AiProposal =
  | { kind: 'replace_block'; block_id: string; block: z.infer<typeof BlockSchema> }
  | { kind: 'replace_section'; section_id: string; section: z.infer<typeof BlockSchema> }
  | {
      kind: 'insert_blocks';
      anchor_block_id: string;
      position: 'above' | 'below';
      blocks: z.infer<typeof BlockSchema>[];
    }
  | { kind: 'review_only'; summary: string };

export const AI_TOOLS = [
  {
    name: 'propose_replace_block',
    description:
      'Propose replacing the selected block with a schema-valid block. Preserve the same block id.',
    input_schema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        block: { type: 'object', description: 'Full block object matching Teaching Hub schema' }
      },
      required: ['block_id', 'block']
    }
  },
  {
    name: 'propose_replace_section',
    description: 'Propose replacing a section block (including children) with a schema-valid section.',
    input_schema: {
      type: 'object',
      properties: {
        section_id: { type: 'string' },
        section: { type: 'object' }
      },
      required: ['section_id', 'section']
    }
  },
  {
    name: 'propose_insert_blocks',
    description: 'Propose inserting one or more schema-valid blocks above or below an anchor block.',
    input_schema: {
      type: 'object',
      properties: {
        anchor_block_id: { type: 'string' },
        position: { type: 'string', enum: ['above', 'below'] },
        blocks: { type: 'array', items: { type: 'object' } }
      },
      required: ['anchor_block_id', 'position', 'blocks']
    }
  },
  {
    name: 'review_only',
    description: 'Provide structured feedback without mutating lesson content.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' }
      },
      required: ['summary']
    }
  }
] as const;

export function parseToolProposal(name: string, input: unknown): AiProposal | { error: string } {
  if (name === 'propose_replace_block') {
    const parsed = ProposeReplaceBlockSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    const block = { ...parsed.data.block, id: parsed.data.block_id };
    return { kind: 'replace_block', block_id: parsed.data.block_id, block };
  }
  if (name === 'propose_replace_section') {
    const parsed = ProposeReplaceSectionSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    if (parsed.data.section.block_type !== 'section') {
      return { error: 'section must be a section block' };
    }
    const section = { ...parsed.data.section, id: parsed.data.section_id };
    return { kind: 'replace_section', section_id: parsed.data.section_id, section };
  }
  if (name === 'propose_insert_blocks') {
    const parsed = ProposeInsertBlocksSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return {
      kind: 'insert_blocks',
      anchor_block_id: parsed.data.anchor_block_id,
      position: parsed.data.position,
      blocks: parsed.data.blocks
    };
  }
  if (name === 'review_only') {
    const parsed = ReviewOnlySchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return { kind: 'review_only', summary: parsed.data.summary };
  }
  return { error: `Unknown tool: ${name}` };
}
