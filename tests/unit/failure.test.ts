import { describe, expect, it } from 'vitest';
import { FAILURE, aiFailureCopy } from '@/app/failure';

describe('predictable failure copy', () => {
  it('tells the teacher whether an AI failure can be retried', () => {
    expect(aiFailureCopy(true)).toBe(FAILURE.aiRetry);
    expect(aiFailureCopy(false)).toBe(FAILURE.aiStopped);
    expect(aiFailureCopy(undefined)).toBe(FAILURE.aiRetry);
  });
});
