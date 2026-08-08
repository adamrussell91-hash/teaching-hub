export function yearKey(id: string): string {
  return `years/${id}`;
}

export function subjectKey(id: string): string {
  return `subjects/${id}`;
}

export function scopeSequenceKey(id: string): string {
  return `scope_sequences/${id}`;
}

export function unitKey(id: string): string {
  return `units/${id}`;
}

export function draftLessonKey(id: string): string {
  return `lessons/${id}`;
}

export function publishedLessonKey(id: string): string {
  return `published/lessons/${id}`;
}

export function classKey(id: string): string {
  return `classes/${id}`;
}

export function scheduledLessonKey(id: string): string {
  return `scheduled_lessons/${id}`;
}

export function scheduleAnchorKey(): string {
  return 'meta/schedule_anchor_date';
}
