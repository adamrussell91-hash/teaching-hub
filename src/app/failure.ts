export const FAILURE = {
  network: 'Unable to load. Please refresh to try again.',
  unsupportedBlock: 'This block cannot be shown.',
  imageUnavailable: 'Image unavailable.',
  videoUnavailable: 'Video unavailable.',
  embedUnavailable: 'Embed unavailable.',
  aiRetry: 'AI is unavailable. You can try again.',
  aiStopped: 'AI request failed and cannot be retried.'
} as const;

export function aiFailureCopy(retryable?: boolean): string {
  return retryable === false ? FAILURE.aiStopped : FAILURE.aiRetry;
}

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = `#${targetId}`;
  link.textContent = 'Skip to content';
  return link;
}
