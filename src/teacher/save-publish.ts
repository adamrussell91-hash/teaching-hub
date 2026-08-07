import { apiPost, apiPut, ApiClientError } from '@/api/client';
import type { Lesson } from '@/schemas/lesson';

export type SaveState = 'saved' | 'saving' | 'unpublished_changes' | 'published' | 'save_failed';

export const SAVE_STATE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unpublished_changes: 'Saved · Unpublished changes',
  published: 'Published',
  save_failed: 'Save failed'
};

export interface PublishSuccess {
  ok: true;
  studentPath: string;
}

export interface PublishFailure {
  ok: false;
  issues: string[];
}

export type PublishOutcome = PublishSuccess | PublishFailure;

interface PublishResponse {
  student_path: string;
}

interface ZodLikeIssue {
  path?: Array<string | number>;
  message?: string;
}

/** Turns Zod validation issues (or any error details) into teacher-facing checklist lines. */
export function formatPublishIssues(error: ApiClientError): string[] {
  const details = error.details;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((issue: unknown) => {
      const candidate = issue as ZodLikeIssue;
      const path = Array.isArray(candidate.path) ? candidate.path.join('.') : '';
      const message = typeof candidate.message === 'string' ? candidate.message : error.message;
      return path.length > 0 ? `${path}: ${message}` : message;
    });
  }
  return [error.message];
}

export interface SaveControllerOptions {
  lessonId: string;
  /** Returns the current in-memory draft snapshot to send on save. */
  getLesson: () => Lesson;
  /** Whether a published snapshot already exists for this lesson. */
  hasPublishedVersion: boolean;
  /** Autosave debounce window in ms. Defaults to 600. */
  debounceMs?: number;
}

/**
 * Framework-agnostic save/publish state machine for a single lesson draft.
 * Autosaves are debounced; `saveNow` / `flush` bypass the debounce for the
 * manual Save button and for flushing before navigating away.
 */
export class SaveController {
  private readonly lessonId: string;
  private readonly getLesson: () => Lesson;
  private readonly debounceMs: number;
  private readonly listeners = new Set<(state: SaveState) => void>();

  private hasPublishedVersion: boolean;
  private state: SaveState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private inFlight = false;
  private resaveRequested = false;
  private disposed = false;

  constructor(options: SaveControllerOptions) {
    this.lessonId = options.lessonId;
    this.getLesson = options.getLesson;
    this.hasPublishedVersion = options.hasPublishedVersion;
    this.debounceMs = options.debounceMs ?? 600;
    this.state = this.hasPublishedVersion ? 'published' : 'saved';
  }

  getState(): SaveState {
    return this.state;
  }

  /** Subscribes to state changes; immediately invoked with the current state. */
  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Call whenever the in-memory draft changes; (re)starts the autosave debounce timer. */
  notifyChange(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, this.debounceMs);
  }

  /** Cancels any pending debounce timer and, if there are unsaved edits, fires an immediate save attempt. */
  flush(): void {
    if (this.disposed) return;
    this.clearTimer();
    if (this.dirty) {
      void this.saveNow();
    }
  }

  /** Saves immediately, bypassing the debounce. Safe to call while a save is already in flight. */
  async saveNow(): Promise<void> {
    if (this.disposed) return;
    this.clearTimer();

    if (this.inFlight) {
      this.resaveRequested = true;
      return;
    }

    this.dirty = false;
    this.inFlight = true;
    this.setState('saving');

    try {
      await apiPut(`/api/lessons/${this.lessonId}`, this.getLesson());
      this.setState(this.hasPublishedVersion ? 'unpublished_changes' : 'saved');
    } catch {
      this.dirty = true;
      this.setState('save_failed');
    } finally {
      this.inFlight = false;
      if (this.resaveRequested) {
        this.resaveRequested = false;
        void this.saveNow();
      }
    }
  }

  /** Publishes the current draft. Resolves with a checklist of issues on validation failure instead of throwing. */
  async publish(): Promise<PublishOutcome> {
    try {
      const result = await apiPost<PublishResponse>(`/api/lessons/${this.lessonId}/publish`);
      this.hasPublishedVersion = true;
      this.dirty = false;
      this.setState('published');
      return { ok: true, studentPath: result.student_path };
    } catch (error) {
      if (error instanceof ApiClientError) {
        return { ok: false, issues: formatPublishIssues(error) };
      }
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(next: SaveState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

export interface SavePublishMountOptions {
  contextBar: HTMLElement;
  controller: SaveController;
  onPublishSuccess?: (studentPath: string) => void;
  onPublishFailure?: (issues: string[]) => void;
}

export interface SavePublishHandle {
  dispose(): void;
}

/**
 * Renders Save + Publish controls into the context bar and wires the
 * existing `[data-save-slot]` element to the controller's state.
 */
export function mountSavePublishControls(options: SavePublishMountOptions): SavePublishHandle {
  const { contextBar, controller } = options;
  const saveSlot = contextBar.querySelector<HTMLElement>('[data-save-slot]');
  if (!saveSlot) {
    throw new Error('Context bar is missing [data-save-slot]');
  }

  const actions = document.createElement('div');
  actions.className = 'context-bar__actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--secondary context-bar__save';
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', () => {
    void controller.saveNow();
  });

  const publishButton = document.createElement('button');
  publishButton.type = 'button';
  publishButton.className = 'btn btn--decisive context-bar__publish';
  publishButton.textContent = 'Publish';
  publishButton.addEventListener('click', () => {
    publishButton.disabled = true;
    void controller
      .publish()
      .then((outcome) => {
        if (outcome.ok) {
          options.onPublishSuccess?.(outcome.studentPath);
        } else {
          options.onPublishFailure?.(outcome.issues);
        }
      })
      .finally(() => {
        publishButton.disabled = false;
      });
  });

  actions.append(saveButton, publishButton);
  contextBar.append(actions);

  const unsubscribe = controller.subscribe((state) => {
    saveSlot.textContent = SAVE_STATE_LABEL[state];
    saveSlot.dataset.saveState = state;
    saveButton.disabled = state === 'saving';
  });

  return {
    dispose() {
      unsubscribe();
      actions.remove();
    }
  };
}
