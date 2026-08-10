/**
 * Shared optional string field parsing for media create/patch handlers.
 */
export function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string
): string | undefined | { error: string } {
  if (record[key] === undefined) return undefined;
  if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
    return { error: `${key} must be a non-empty string when provided` };
  }
  return (record[key] as string).trim();
}
