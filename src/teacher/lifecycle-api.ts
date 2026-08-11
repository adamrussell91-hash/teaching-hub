import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError } from '@/api/client';
import type { DependencyHit } from '@/recovery/dependencies';
import type { EntityStatus } from '@/recovery/lifecycle';

export type LifecycleEntityType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'media'
  | 'lesson_template'
  | 'unit_template'
  | 'composition';

export type TrashSummary = {
  type: LifecycleEntityType;
  id: string;
  title: string;
  trashed_at?: string;
  previous_status?: 'active' | 'archived';
};

const TYPE_TO_COLLECTION: Record<LifecycleEntityType, string> = {
  lesson: 'lessons',
  unit: 'units',
  class: 'classes',
  media: 'media',
  lesson_template: 'lesson-templates',
  unit_template: 'unit-templates',
  composition: 'compositions'
};

export function entityPath(type: LifecycleEntityType, id: string): string {
  return `/api/${TYPE_TO_COLLECTION[type]}/${id}`;
}

export function restoreFromTrashPath(type: LifecycleEntityType, id: string): string {
  return `${entityPath(type, id)}/restore-from-trash`;
}

export function dependenciesPath(type: LifecycleEntityType, id: string): string {
  return `${entityPath(type, id)}/dependencies`;
}

export function patchStatus(path: string, status: EntityStatus): Promise<unknown> {
  return apiPatch(path, { status });
}

export function listTrash(): Promise<TrashSummary[]> {
  return apiGet<TrashSummary[]>('/api/trash');
}

export function restoreFromTrash(type: LifecycleEntityType, id: string): Promise<unknown> {
  return apiPost(restoreFromTrashPath(type, id), {});
}

export function permanentDelete(
  type: LifecycleEntityType,
  id: string
): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(entityPath(type, id));
}

export function getDependencies(
  type: LifecycleEntityType,
  id: string
): Promise<{ dependencies: DependencyHit[] }> {
  return apiGet<{ dependencies: DependencyHit[] }>(dependenciesPath(type, id));
}

export function formatDependencyList(deps: DependencyHit[]): string {
  return deps
    .map((dep) => {
      const label = dep.title?.trim() || dep.id;
      return `• ${label} — ${dep.detail}`;
    })
    .join('\n');
}

export function dependenciesFromError(error: unknown): DependencyHit[] {
  if (!(error instanceof ApiClientError)) return [];
  if (error.code !== 'conflict') return [];
  const details = error.details;
  if (typeof details !== 'object' || details === null) return [];
  const deps = (details as { dependencies?: unknown }).dependencies;
  return Array.isArray(deps) ? (deps as DependencyHit[]) : [];
}

/** Preflight dependencies, confirm, then trash. Returns true if trashed. */
export async function confirmAndTrash(
  type: LifecycleEntityType,
  id: string,
  title: string
): Promise<boolean> {
  let dependencies: DependencyHit[] = [];
  try {
    const result = await getDependencies(type, id);
    dependencies = result.dependencies;
  } catch {
    // Still allow trash if dependency preflight fails.
  }

  const quoted = `“${title}”`;
  if (dependencies.length > 0) {
    const ok = window.confirm(
      `${quoted} is still referenced by:\n${formatDependencyList(dependencies)}\n\nMove to trash anyway?`
    );
    if (!ok) return false;
  } else {
    const ok = window.confirm(`Move ${quoted} to trash?`);
    if (!ok) return false;
  }

  await patchStatus(entityPath(type, id), 'trashed');
  return true;
}

export async function confirmAndArchive(path: string, title: string): Promise<boolean> {
  const ok = window.confirm(`Archive “${title}”?`);
  if (!ok) return false;
  await patchStatus(path, 'archived');
  return true;
}
