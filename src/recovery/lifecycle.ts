export type EntityStatus = 'active' | 'archived' | 'trashed';

export type LifecycleFields = {
  status: EntityStatus;
  trashed_at?: string;
  previous_status?: Exclude<EntityStatus, 'trashed'>;
  trash_reason?: string;
};

export function applyArchive<T extends { status: EntityStatus }>(obj: T): T {
  const {
    trashed_at: _t,
    previous_status: _p,
    trash_reason: _r,
    ...rest
  } = obj as T & LifecycleFields;
  return { ...rest, status: 'archived' } as T;
}

export function applyTrash<T extends LifecycleFields>(
  obj: T,
  trashedAt: string,
  reason?: string
): T {
  const previous =
    obj.status === 'trashed' ? obj.previous_status ?? 'active' : (obj.status as 'active' | 'archived');
  const { trash_reason: _oldReason, ...withoutReason } = obj;
  return {
    ...withoutReason,
    previous_status: previous,
    trashed_at: trashedAt,
    status: 'trashed',
    ...(reason ? { trash_reason: reason } : {})
  } as T;
}

export function applyRestoreFromTrash<T extends LifecycleFields>(obj: T): T {
  const nextStatus = obj.previous_status ?? 'active';
  const { trashed_at: _t, previous_status: _p, trash_reason: _r, ...rest } = obj;
  return { ...rest, status: nextStatus } as T;
}
