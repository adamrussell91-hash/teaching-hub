export function yearKey(id: string): string {
  return `years/${id}`;
}

export function subjectKey(id: string): string {
  return `subjects/${id}`;
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
