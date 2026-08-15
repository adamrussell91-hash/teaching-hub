import { describe, expect, it } from 'vitest';
import { buildKernelJobPayload } from '@/ai/jobs';

const lesson = { id: 'lesson_1', title: 'Othello' };
const transcript = [{ role: 'user' as const, content: 'Build a lesson' }];

describe('buildKernelJobPayload', () => {
  it('attaches archive findings to the kernel body', () => {
    const findings = [
      { pageId: 'p1', title: 'Othello notes', excerpt: 'jealousy', stance: 'related' }
    ];
    const payload = buildKernelJobPayload({
      query: 'Build a lesson on Othello',
      lesson,
      transcript,
      archive: {
        note: 'Archive findings (cite these; never invent pages).',
        findings
      }
    });

    expect(payload.query).toBe('Build a lesson on Othello');
    expect(payload.lesson).toBe(lesson);
    expect(payload.transcript).toEqual(transcript);
    expect(payload.findings).toEqual(findings);
    expect(payload.archiveFailed).toBe(false);
    expect(payload.archive).toEqual({
      findings,
      archiveFailed: false,
      note: 'Archive findings (cite these; never invent pages).'
    });
  });

  it('keeps a failed archive as a note and does not invent citations', () => {
    const payload = buildKernelJobPayload({
      query: 'Build a lesson',
      lesson,
      transcript,
      archive: {
        archiveFailed: true,
        findings: [],
        note: 'The archive pull failed. Say so in character and continue with what you have. Do not invent citations.'
      }
    });

    expect(payload.query).toBe('Build a lesson');
    expect(payload.lesson).toBe(lesson);
    expect(payload.archiveFailed).toBe(true);
    expect(payload.findings).toEqual([]);
    expect(payload.archive.archiveFailed).toBe(true);
    expect(payload.archive.findings).toEqual([]);
    expect(payload.archive.note).toContain('Do not invent citations');
  });
});
