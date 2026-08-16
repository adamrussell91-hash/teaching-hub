export const BUILDER_CHROME_KEY = 'teaching_hub_lesson_builder_chrome_v2';

export type ShelfState = 'open' | 'shelved';

export type BuilderChromePrefs = { rail: ShelfState; chat: ShelfState };

export const DEFAULT_BUILDER_CHROME: BuilderChromePrefs = { rail: 'open', chat: 'shelved' };

function isShelfState(value: unknown): value is ShelfState {
  return value === 'open' || value === 'shelved';
}

function isBuilderChromePrefs(value: unknown): value is BuilderChromePrefs {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return isShelfState(v.rail) && isShelfState(v.chat);
}

export function readBuilderChromePrefs(): BuilderChromePrefs {
  try {
    const raw = localStorage.getItem(BUILDER_CHROME_KEY);
    if (!raw) return DEFAULT_BUILDER_CHROME;
    const parsed: unknown = JSON.parse(raw);
    if (!isBuilderChromePrefs(parsed)) return DEFAULT_BUILDER_CHROME;
    return parsed;
  } catch {
    return DEFAULT_BUILDER_CHROME;
  }
}

export function writeBuilderChromePrefs(next: BuilderChromePrefs): void {
  try {
    localStorage.setItem(BUILDER_CHROME_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}
