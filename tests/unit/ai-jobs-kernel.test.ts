import { describe, expect, it } from 'vitest';
import {
  applyKernelOutcome,
  classifyKernelResponse,
  isStaleWorkingJob,
  type AiJob
} from '@/ai/jobs';

const workingJob: AiJob = {
  id: 'job_1',
  lesson_id: 'lesson_1',
  agent: 'clementine',
  status: 'working',
  snapshot_at: '2026-08-15T01:00:00.000Z',
  message: 'Build a lesson on Othello',
  created_at: '2026-08-15T01:00:00.000Z'
};

describe('classifyKernelResponse', () => {
  it('treats HTTP 404 as a missing kernel', () => {
    expect(classifyKernelResponse({ secret: 's', status: 404 })).toEqual({ kind: 'missing' });
  });

  it('treats HTTP 500 as a kernel failure', () => {
    expect(classifyKernelResponse({ secret: 's', status: 500 })).toMatchObject({
      kind: 'failed'
    });
  });

  it('treats invalid JSON as a kernel failure', () => {
    expect(classifyKernelResponse({ secret: 's', status: 200, invalidJson: true })).toMatchObject({
      kind: 'failed'
    });
  });

  it('treats an unset secret as a missing kernel', () => {
    expect(classifyKernelResponse({})).toEqual({ kind: 'missing' });
  });
});

describe('applyKernelOutcome', () => {
  it('uses the fixture proposal only when the kernel is missing', () => {
    const next = applyKernelOutcome(workingJob, { kind: 'missing' });
    expect(next.status).toBe('done');
    expect(next.proposal?.kind).toBe('replace_lesson');
  });

  it('does not mint a fixture proposal on kernel failure', () => {
    const next = applyKernelOutcome(workingJob, {
      kind: 'failed',
      error: 'Kernel returned HTTP 500'
    });
    expect(next.status).toBe('error');
    expect(next.error).toBe('Kernel returned HTTP 500');
    expect(next.proposal).toBeUndefined();
  });
});

describe('isStaleWorkingJob', () => {
  it('marks working jobs older than 10 minutes as stale', () => {
    const now = Date.parse('2026-08-15T01:11:00.000Z');
    expect(isStaleWorkingJob(workingJob, now)).toBe(true);
    expect(
      isStaleWorkingJob({ ...workingJob, created_at: '2026-08-15T01:05:00.000Z' }, now)
    ).toBe(false);
  });
});
