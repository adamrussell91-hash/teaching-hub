import { z } from 'zod';
import type { ArchivePull } from '@/ai/archiveKernel';
import type { AiProposal } from '@/ai/proposals';
import { ProposeReplaceLessonSchema } from '@/ai/proposals';
import { countBlocksInTree } from '@/teacher/lesson-canvas/drop';

export const AiJobAgentSchema = z.enum(['clementine', 'ann', 'hammond', 'clare']);
export const AiJobStatusSchema = z.enum(['working', 'done', 'error']);

export const AiJobCreateSchema = z.object({
  lesson_id: z.string().min(1),
  agent: AiJobAgentSchema,
  message: z.string().min(1).max(8000)
});

export type AiJobCreate = z.infer<typeof AiJobCreateSchema>;

export type AiTranscriptTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiJob = {
  id: string;
  lesson_id: string;
  agent: z.infer<typeof AiJobAgentSchema>;
  status: z.infer<typeof AiJobStatusSchema>;
  snapshot_at: string;
  message: string;
  proposal?: AiProposal;
  error?: string;
  archiveFailed?: boolean;
  created_at: string;
};

export type KernelJobPayload = {
  query: string;
  lesson: unknown;
  transcript: AiTranscriptTurn[];
  archive: {
    findings: ArchivePull['findings'];
    archiveFailed: boolean;
    note: string;
  };
  findings: ArchivePull['findings'];
  archiveFailed: boolean;
};

export function buildKernelJobPayload(input: {
  query: string;
  lesson: unknown;
  transcript: AiTranscriptTurn[];
  archive?: ArchivePull | null;
}): KernelJobPayload {
  const findings = input.archive?.findings ?? [];
  const archiveFailed = Boolean(input.archive?.archiveFailed);
  const note = input.archive?.note ?? '';
  return {
    query: input.query,
    lesson: input.lesson,
    transcript: input.transcript,
    findings,
    archiveFailed,
    archive: {
      findings,
      archiveFailed,
      note
    }
  };
}

export function fixtureReplaceLessonProposal(): AiProposal {
  const now = new Date().toISOString();
  return {
    kind: 'replace_lesson',
    blocks: [
      {
        id: 'mock-ai-heading',
        type: 'block',
        block_type: 'heading',
        variant: 'page',
        visibility: 'student_teacher',
        content: { text: 'Heading' },
        layout: {},
        print: {},
        settings: {},
        created_at: now,
        updated_at: now,
        schema_version: 1
      }
    ]
  };
}

export function appendTranscriptTurns(
  existing: AiTranscriptTurn[] | null | undefined,
  turns: AiTranscriptTurn[],
  max = 50
): AiTranscriptTurn[] {
  const prior = Array.isArray(existing) ? existing : [];
  return [...prior, ...turns].slice(-max);
}

export function proposalFromKernelPayload(payload: unknown): AiProposal | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const candidate = (raw.proposal ?? raw) as Record<string, unknown>;
  if (!candidate || typeof candidate !== 'object') return null;
  const parsed = ProposeReplaceLessonSchema.safeParse({
    title: candidate.title,
    cover: candidate.cover,
    blocks: candidate.blocks
  });
  if (!parsed.success) return null;
  if (countBlocksInTree(parsed.data.blocks) > 48) return null;
  return {
    kind: 'replace_lesson',
    title: parsed.data.title,
    cover: parsed.data.cover,
    blocks: parsed.data.blocks
  };
}
